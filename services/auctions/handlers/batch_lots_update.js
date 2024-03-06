/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-param-reassign */
/* eslint-disable camelcase */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-undef */
const redis = require('redis')
const request = require('request')
const { StepFunctions, config } = require('aws-sdk')

const mongodbHelper = require('../lib/mongodb_helper')
const StepFunctionArn = require('../entities/stepFunctionArn')

config.update({ region: 'eu-west-2' })

async function startExecution(executionARN, lots) {
    console.log('executionarn', executionARN, lots)
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
                console.log('getaran', getArn)
                const updateARN = await mongodbHelper.updateArn(getArn, data, StepFunctionArn)
                resolve(data)
            }
            resolve({ status: false })
        })
    })
}

async function stopExecutions(executionArn) {
    console.log('INSIDE STOP: ', executionArn)
    const stepFunctions = new StepFunctions()
    const params = {
        executionArn,
        cause: 'User initiated stop',
    }
    return new Promise((resolve, reject) => {
        stepFunctions.stopExecution(params, async (error, data) => {
            console.log('errr', error, data)
            if (error) {
                reject(error)
            }
            if (data) {
                resolve(data)
            }
            resolve({ status: false })
        })
    })
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
        console.log('client', client)
        if (!client.isOpen) {
            await client.connect()
        }
        const multi = client.multi()
        const lot_id = lotInformation._id.toString()
        const bidKey = `lot:${lot_id}`
        const existingRecord = await client.hGet('lot', bidKey)
        const get_lot = JSON.parse(existingRecord)
        const updateRequest = {
            ...get_lot,
            // lot_end_date: lotInformation.lot_end_time,
            lot_extended: true,
            end_date: lotInformation.lot_end_time,
            // recent_extended_time: recentExtendedTime,
        }
        const updateRedis = await multi.hSet('lot', bidKey, JSON.stringify(updateRequest))
        let afterUpdateLots = await client.hGet('lot', bidKey)
        afterUpdateLots = JSON.parse(existingRecord)

        const responses = await multi.exec()
        const payload = {
            lots: afterUpdateLots,
        }
        const headersList = {
            Accept: '*/*',
            'User-Agent': 'API TEST',
            'Content-Type': 'application/json',
        }

        const reqUrl = `${process.env.SOCKET_URL}/notification`
        request.post({
            url: reqUrl,
            body: JSON.stringify(payload),
            headers: headersList,
        }, (error, response, body) => {
            if (error) {
                console.error('Error:', error)
            } else {
                try {
                    const responseData = JSON.parse(body)
                    console.log('responseData', responseData)
                    // Handle the successful response
                    // Your logic here
                } catch (parseError) {
                    console.error('Error parsing response:', parseError)
                }
            }
        })

        console.log('#######', JSON.stringify(responses))
    } catch (err) {
        console.log(err)
    }
}

module.exports.handler = async (event) => {
    try {
        console.log('event', JSON.stringify(event))

        const firstRecord = event.Records[0]
        const lotsString = firstRecord.messageAttributes.lots.stringValue
        const auctionString = firstRecord.messageAttributes.auction.stringValue
        const type = firstRecord.messageAttributes.type.stringValue
        console.log('fsas', firstRecord, lotsString, auctionString, type)
        // Parsing the JSON strings to JavaScript objects
        const auctionLots = JSON.parse(lotsString)
        const auctionDetails = JSON.parse(auctionString)
        const client = await redis.createClient({
            url: process.env.REDIS_CONNECTION_URL,
        }).on('error', (err) => console.log('Redis Client Error', err)).connect()

        if (!client.isOpen) {
            await client.connect()
        }
        if (type === 'update') {
            const stepFunctionEnd = []
            const getAllArns = await mongodbHelper.getAllExecutionArn(auctionDetails, StepFunctionArn)
            for (const item of getAllArns) {
                const executionArn = item.arn
                stepFunctionEnd.push(stopExecutions(executionArn))
            }
            await Promise.all(stepFunctionEnd)
            let extend_time = auctionDetails.extension_time.replace('m', '')
            extend_time = parseInt(extend_time, 10)
            extend_time = extend_time * 60 * 1000
            // Start the new execution
            const startNewExecution = []
            for (const item of auctionLots) {
                // item.lot_end_time = item.end_date + extend_time
                if (item.end_date > currentTimeEpoch) {
                    const currentTimeEpoch = Date.now()
                    if (item.end_date > currentTimeEpoch) {
                        startNewExecution.push(startExecution(process.env.LOT_PUBLISHED_ARN, item))
                    }
                }
            }
            await Promise.all(startNewExecution)
            // Code extends in Redis cache and send extension alerts
            const promiseList = []
            for (const item of auctionLots) {
                // item.lot_end_time = item.end_date + extend_time
                item.recent_extended_time = currentTimeEpoch
                if (item.end_date > currentTimeEpoch) {
                    promiseList.push(findAndUpdateTime(item, client))
                }
            }
            await Promise.all(promiseList)
        }
        if (type === 'published') {
            // Start the new execution
            const startNewExecution = []
            for (const item of auctionLots) {
                // item.lot_end_time = item.end_date + extend_time
                if (item.end_date > currentTimeEpoch) {
                    const currentTimeEpoch = Date.now()
                    if (item.end_date > currentTimeEpoch) {
                        startNewExecution.push(startExecution(process.env.LOT_PUBLISHED_ARN, item))
                    }
                }
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
