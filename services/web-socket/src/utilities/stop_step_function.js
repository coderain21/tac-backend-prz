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
        stepfunctions.startExecution(params, (error, data) => {
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

async function getLotDeatils(rediskey, client, lotID) {
    const lot_id = lotID.toString()
    const allBidders = await client.hGetAll('lot', rediskey)
    // Filter out the current bidder and return an array
    return Object.values(allBidders || {}).filter((bidder) => {
        const parsedBidder = JSON.parse(bidder)
        return parsedBidder._id === lot_id
    })
}

async function findAndUpdateTime(lotInformation, client, io, socket, currentLotDetails, auctionDetails,auctionLots) {
    console.log('inside find and update', lotInformation, currentLotDetails)
    try {
        if (!client.isOpen) {
            await client.connect()
        }
        const lot_id = lotInformation._id.toString()
        const bidKey = `lot:${lot_id}`
        const existingRecord = await client.hGet('lot', bidKey)
        const get_lot = JSON.parse(existingRecord)
        console.log('get lot', get_lot)
        const updateRequest = {
            ...get_lot,
            lot_end_date: lotInformation.lot_end_time,
            lot_extended: true,
            end_date: lotInformation.lot_end_time,
        }
        console.log('bidkey', bidKey)
        const x = await client.hSet('lot', bidKey, JSON.stringify(updateRequest))
        console.log('xxx', x)
        const lotDetails = await getLotDeatils(bidKey, client,lot_id)
        const lotData = {
            extended: true,
            extended_time: auctionDetails.extension_time,
            lot_id: lotInformation._id,
            extension_type: auctionDetails.extension_type,
        }
        const sendEmit = await extensionAlert(socket, lotData, io)
        socket.emit('joinBidRoom', auctionLots)

        return true
    } catch (err) {
        console.log(err)
    }
}

module.exports.stopExecution = async (currentLotDetails, auctionDetails, auctionLots, client, io, socket) => {
    try {
        console.log('stop exec')
        console.log('inputssss', currentLotDetails, auctionDetails, auctionLots)
        const stepFunctions = new StepFunctions()
        if ((auctionDetails.extension_type === 'All Lots' || auctionDetails.extension_type === 'Cascaded') && currentLotDetails.lot_extended !== true) {
            let extend_time = auctionDetails.extension_time.replace('m', '')
            extend_time = parseInt(extend_time, 10)
            extend_time = extend_time * 60 * 1000
            for (const item of auctionLots) {
                item.lot_end_time = item.end_date + extend_time
                const gg = await findAndUpdateTime(item, client, io, socket, currentLotDetails, auctionDetails, auctionLots)
                console.log('gggg', gg)
                const getArn = await mongodbHelper.getExecutionArn(item)
                console.log('getarn', getArn)
                const executionArn = getArn[0].arn
                const response = await stepFunctions.stopExecution({
                    executionArn,
                    cause: 'User initiated stop', // Optional: Specify a cause for stopping the execution
                }).promise()
                console.log('stop response', response)
                const cc  = await startExecution('arn:aws:states:eu-west-2:929441721738:stateMachine:dev-lot-published', item)
                console.log('cc', cc)
            }
        }
        if (auctionDetails.extension_type === 'Individual' && currentLotDetails.lot_extended !== true) {
            let extend_time = auctionDetails.extension_time.replace('m', '')
            extend_time = parseInt(extend_time, 10)
            extend_time = extend_time * 60 * 1000
            currentLotDetails.lot_end_time = currentLotDetails.end_date + extend_time
            // await findAndUpdateTime(currentLotDetails._id, currentLotDetails.lot_end_time, client, io, socket, currentLotDetails)
            const redisUpdate = await findAndUpdateTime(currentLotDetails, client, io, socket, currentLotDetails, auctionDetails, auctionLots)
            console.log('redis update', redisUpdate)
            const getArn = await mongodbHelper.getExecutionArn(currentLotDetails)
            console.log('getarn', getArn)
            const executionArn = getArn[0].arn
            const response = await stepFunctions.stopExecution({
                executionArn,
                cause: 'User initiated stop', // Optional: Specify a cause for stopping the execution
            }).promise()
            await startExecution('arn:aws:states:eu-west-2:929441721738:stateMachine:dev-lot-published', currentLotDetails)
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
