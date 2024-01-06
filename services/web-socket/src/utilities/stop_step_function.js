/* eslint-disable consistent-return */
/* eslint-disable no-param-reassign */
/* eslint-disable camelcase */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-unreachable-loop */
/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
/* eslint-disable no-await-in-loop */
const { StepFunctions, config } = require('aws-sdk')
const mongodbHelper = require('./mongodb_helper')
const { extensionAlert } = require('../routes/update_extension')

config.update({ region: 'eu-west-2' })

async function startExecution(executionARN, lots) {
    console.log('start execution start', lots)
    const params = {
        stateMachineArn: executionARN,
        input: JSON.stringify(lots),
    }
    console.log('params', params)
    const stepfunctions = new StepFunctions()
    return new Promise((resolve, reject) => {
        stepfunctions.startExecution(params, async (error, data) => {
            if (error) {
                reject(error)
            }
            if (data) {
                console.log('start execution relove block', data)
                const getArn = await mongodbHelper.getExecutionArn(lots)
                const updateARN = await mongodbHelper.update(getArn[0], data)
                console.log('updateARN', updateARN)
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

async function findAndUpdateTime(lotInformation, client, io, socket, currentLotDetails, auctionDetails, auctionLots) {
    try {
        lotInformation.initial_end_time = lotInformation.end_date
        if (!client.isOpen) {
            await client.connect()
        }
        const lot_id = lotInformation._id.toString()
        const bidKey = `lot:${lot_id}`
        const existingRecord = await client.hGet('lot', bidKey)
        const get_lot = JSON.parse(existingRecord)
        console.log('findandup', lot_id, typeof lot_id)
        const updateRequest = {
            ...get_lot,
            lot_end_date: lotInformation.lot_end_time,
            lot_extended: true,
            end_date: lotInformation.lot_end_time,
        }
        const updateRedis = await client.hSet('lot', bidKey, JSON.stringify(updateRequest))
        console.log('updateee', updateRedis)
        const lotData = {
            extended: true,
            extended_time: auctionDetails.extension_time,
            lot_id: lotInformation._id,
            extension_type: auctionDetails.extension_type,
        }
        const sendEmit = await extensionAlert(socket, lotData, io)
        return true
    } catch (err) {
        console.log(err)
    }
}

/*  Function to stop the execution of Step Functions for auction lots
    * Create StepFunctions instance
    * The function starts by creating an instance of the StepFunctions class.
    * It checks the extension_type in auctionDetails to determine the course of action.
    * If the extension type is either 'All Lots' or 'Cascade', it iterates through auction lots, extends their end times, updates the database, stops Step Functions executions, and starts new executions.
    * If the extension type is 'Individual Lots', it extends the end time for the current lot, updates the database, stops the Step Functions execution, and starts a new execution for the specific lot.
*/

module.exports.stopExecution = async (currentLotDetails, auctionDetails, auctionLots, client, io, socket) => {
    try {
        console.log('auctionDetails', auctionDetails)
        const stepFunctions = new StepFunctions()
        if ((auctionDetails.extension_type === 'All Lots' || auctionDetails.extension_type === 'Cascade')) {
        // if ((auctionDetails.extension_type === 'All Lots' || auctionDetails.extension_type === 'Cascaded') && currentLotDetails.lot_extended !== true) {
            let extend_time = auctionDetails.extension_time.replace('m', '')
            extend_time = parseInt(extend_time, 10)
            extend_time = extend_time * 60 * 1000
            for (const item of auctionLots) {
                item.lot_end_time = item.end_date + extend_time
                const gg = await findAndUpdateTime(item, client, io, socket, currentLotDetails, auctionDetails, auctionLots)
                const getArn = await mongodbHelper.getExecutionArn(item)
                const executionArn = getArn[0].arn
                const response = await stepFunctions.stopExecution({
                    executionArn,
                    cause: 'User initiated stop', // Optional: Specify a cause for stopping the execution
                }).promise()
                const executeStepFunction = await startExecution('arn:aws:states:eu-west-2:929441721738:stateMachine:dev-lot-published', item)
                const updateLot = await mongodbHelper.updateSignleLot({ lot_id: item._id, end_date: item.lot_end_time })
            }
            socket.emit('joinBidRoom', auctionLots)
            const updatedInformation = {
                end_date: auctionDetails.end_date + extend_time,
            }
            const changeAuctionEnddate = await mongodbHelper.updateAuctionData('indyauction-develop', 'dev-auctions', auctionDetails._id, updatedInformation)
        }
        if (auctionDetails.extension_type === 'Individual Lots') {
            let extend_time = auctionDetails.extension_time.replace('m', '')
            extend_time = parseInt(extend_time, 10)
            extend_time = extend_time * 60 * 1000
            currentLotDetails.lot_end_time = currentLotDetails.end_date + extend_time
            const redisUpdate = await findAndUpdateTime(currentLotDetails, client, io, socket, currentLotDetails, auctionDetails, auctionLots)
            const getArn = await mongodbHelper.getExecutionArn(currentLotDetails)
            const executionArn = getArn[0].arn
            const response = await stepFunctions.stopExecution({
                executionArn,
                cause: 'User initiated stop', // Optional: Specify a cause for stopping the execution
            }).promise()
            await startExecution('arn:aws:states:eu-west-2:929441721738:stateMachine:dev-lot-published', currentLotDetails)
            const updatedInformation = {
                end_date: auctionDetails.end_date + extend_time,
            }
            const changeAuctionEnddate = await mongodbHelper.updateAuctionData('indyauction-develop', 'dev-auctions', auctionDetails._id, updatedInformation)
            const updateLot = await mongodbHelper.updateSignleLot({ lot_id: currentLotDetails._id, end_date: currentLotDetails.lot_end_time })
        }
        return true
    } catch (error) {
        console.log('err', error)
        return {
            status: false,
            message: 'Authentication Failed',
        }
    }
}
