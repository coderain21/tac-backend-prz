/* eslint-disable no-await-in-loop */
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-param-reassign */
/* eslint-disable camelcase */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-undef */
const request = require('request')
const redis = require('redis')

const { StepFunctions, config } = require('aws-sdk')
const mongodbHelper = require('../lib/mongodb_helper')
const StepFunctionArn = require('../entities/stepFunctionArn')
const redisHelper = require('../lib/redis_helper')

mongodbHelper.connect()
const Lot = require('../entities/Lot')

config.update({ region: 'eu-west-2' })

const currentTimeEpoch = Date.now()

async function startExecution(executionARN, lots) {
    try {
        console.log('execution starteddd')
        const stepfunctions = new StepFunctions()
        const newStartDate = new Date(lots.start_date).toISOString()
        lots.start_date = newStartDate
        const params = {
            stateMachineArn: executionARN,
            input: JSON.stringify(lots),
        }

        return new Promise((resolve, reject) => {
            stepfunctions.startExecution(params, async (error, data) => {
                if (error) {
                    reject(error)
                }
                if (data) {
                    const getArn = await mongodbHelper.getExecutionArn(lots, StepFunctionArn)
                    await mongodbHelper.updateArn(getArn, data, StepFunctionArn)
                    resolve(data)
                }
                resolve({ status: false })
            })
        })
    } catch (err) {
        console.log('start err', err)
    }
}

async function startExecutionAfterPublish(executionARN, lots) {
    try {
        const stepfunctions = new StepFunctions()
        const newStartDate = new Date(lots.start_date).toISOString()
        lots.start_date = newStartDate
        const params = {
            stateMachineArn: executionARN,
            input: JSON.stringify(lots),
        }
        return new Promise((resolve, reject) => {
            stepfunctions.startExecution(params, async (error, data) => {
                if (error) {
                    reject(error)
                }
                if (data) {
                    const requestPayload = {
                        arn: data.executionArn,
                        lot_id: lots._id.toString(),
                        auction_id: lots.auction_id,
                        seller_email: lots.seller_email,
                    }
                    await mongodbHelper.save(requestPayload, StepFunctionArn)
                    resolve(data)
                }
                resolve({ status: false })
            })
        })
    } catch (err) {
        console.log('errr', err)
    }
}

/*
The function begins by setting the initial end time of the lot based on its end date.
It checks if the Redis client is open and connects if it is not.
It retrieves existing information about the lot from Redis using the lot's ID.
The existing record is parsed, and a new set of information is created for updating, including extending the lot's end date and marking it as extended.
The updated information is then stored back in the Redis database.
Additional data about the lot and the auction extension is prepared.
An extension alert is sent using a custom function (extensionAlert) with information about the extended lot.
A socket event is emitted to join a bid room, and the function returns true on successful execution.
*/

async function findAndUpdateTime(lotInformation, client) {
    try {
        lotInformation.initial_end_time = lotInformation.end_date
        const lot_id = lotInformation._id.toString()
        const bidKey = `lot:${lot_id}`
        const existingRecord = await client.hget('lot', bidKey)
        const get_lot = JSON.parse(existingRecord)
        const updateRequest = {
            ...get_lot,
            lot_end_date: lotInformation.lot_end_time,
            end_date: lotInformation.lot_end_time,
        }
        console.log('updateRequest', updateRequest)
        const updatePromise = client
            .multi()
            .hset('lot', bidKey, JSON.stringify(updateRequest))
            .exec()
        await Promise.all([updatePromise])
        const payload = { lots: updateRequest }
        const headersList = {
            Accept: '*/*',
            'User-Agent': 'API TEST',
            'Content-Type': 'application/json',
        }
        const reqUrl = `${process.env.SOCKET_URL}/notification`
        console.log(reqUrl)
        return new Promise((resolve, reject) => {
            const options = {
                method: 'POST',
                url: reqUrl,
                headers: headersList,
                body: JSON.stringify(payload),
            }

            request(options, (error, response) => {
                if (error) {
                    console.error('Error:', error)
                    reject(error)
                } else {
                    console.log('Response:', response.statusCode)
                    resolve(response)
                }
            })
        })
    } catch (err) {
        console.log(err)
    }
}

async function stopExecutions(executionArn) {
    try {
        console.log('INSIDE STOP: ')
        const stepFunctions = new StepFunctions()
        const params = {
            executionArn,
            cause: 'User initiated stop',
        }
        return new Promise((resolve, reject) => {
            stepFunctions.stopExecution(params, async (error, data) => {
                if (error) {
                    reject(error)
                }
                if (data) {
                    resolve(data)
                }
                resolve({ status: false })
            })
        })
    } catch (err) {
        console.log('errrireds', err)
    }
}

async function redisUpdateAll(auctionLots, client, extend_time) {
    try {
        const redisPromise = []
        for (const item of auctionLots) {
            console.log('item', item)
            item.lot_end_time = item.end_date + extend_time
            if (item.end_date > currentTimeEpoch) {
                redisPromise.push(findAndUpdateTime(item, client))
            }
        }
        await Promise.all(redisPromise)
    } catch (err) {
        console.log('redisupdateerr', err)
    }
}

module.exports.handler = async (event) => {
    try {
        const firstRecord = event.Records[0]
        const lotsString = firstRecord.messageAttributes.lots.stringValue
        const auctionString = firstRecord.messageAttributes.auction.stringValue
        const type = firstRecord.messageAttributes.type.stringValue
        const auctionLots = JSON.parse(lotsString)
        const auctionDetails = JSON.parse(auctionString)
        const client = await redisHelper.createRedisClient()
        let extend_time = auctionDetails.extension_time.replace('m', '')
        extend_time = parseInt(extend_time, 10)
        extend_time = extend_time * 60 * 1000
        if (type === 'update') {
            const stepFunctionEnd = []
            const operations = []
            const startExecutions = []
            const redisUpdate = []
            redisUpdate.push(redisUpdateAll(auctionLots, client, extend_time))
            for (const item of auctionLots) {
                console.log('item', item)
                item.lot_end_time = item.end_date + extend_time
                console.log('curre', currentTimeEpoch, item.end_date > currentTimeEpoch)
                if (item.end_date > currentTimeEpoch) {
                    const getAllArns = await mongodbHelper.singleGetAllExecutionArn(item, StepFunctionArn)
                    console.log('getAllArns', getAllArns)
                    const executionArn = getAllArns.arn
                    startExecutions.push(startExecution(process.env.STATE_MACHINE_LOT_ARN, item))
                    stepFunctionEnd.push(stopExecutions(executionArn))
                    operations.push(mongodbHelper.updateSignleLot({ lot_id: item._id, end_date: item.lot_end_time }, Lot))
                }
            }
            await Promise.all([redisUpdate, startExecutions, stepFunctionEnd, operations])
        }

        if (type === 'published') {
            // Start the new execution
            const startNewExecution = []
            for (const item of auctionLots) {
                startNewExecution.push(startExecutionAfterPublish(process.env.STATE_MACHINE_LOT_ARN, item))
            }
            await Promise.all(startNewExecution)
        }
    } catch (error) {
        console.log('err', error)
        return {
            status: false,
            message: 'Authentication Failed',
        }
    }
}
