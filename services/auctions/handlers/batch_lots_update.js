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

const { config } = require('aws-sdk')
const mongodbHelper = require('../lib/mongodb_helper')
const StepFunctionArn = require('../entities/stepFunctionArn')
const redisHelper = require('../lib/redis_helper')
const { startExecution, startExecutionAfterPublish, stopExecutions } = require('../lib/step_function_helper')

mongodbHelper.connect()
const Lot = require('../entities/Lot')

config.update({ region: 'eu-west-2' })

const currentTimeEpoch = Date.now()

module.exports.handler = async (event) => {
    try {
        const firstRecord = event.Records[0]
        const lotsString = firstRecord.messageAttributes.lots.stringValue
        const auctionString = firstRecord.messageAttributes.auction.stringValue
        const type = firstRecord.messageAttributes.type.stringValue
        const auctionLots = JSON.parse(lotsString)
        const auctionDetails = JSON.parse(auctionString)
        const client = await redisHelper.createRedisClient()
        const extend_time = parseInt(auctionDetails.extension_time.replace('m', ''), 10) * 60 * 1000

        if (type === 'update') {
            const redisUpdatePromise = redisHelper.redisUpdateAll(auctionLots, client, extend_time)

            const batchOperations = auctionLots
                .filter((item) => item.end_date > currentTimeEpoch)
                .map(async (item) => {
                    item.lot_end_time = item.end_date + extend_time
                    const getAllArns = await mongodbHelper.singleGetAllExecutionArn(item, StepFunctionArn)
                    const executionArn = getAllArns.arn
                    return Promise.all([
                        startExecution(process.env.STATE_MACHINE_LOT_ARN, item),
                        stopExecutions(executionArn),
                        mongodbHelper.updateSignleLot({ lot_id: item._id, end_date: item.lot_end_time }, Lot),
                    ])
                })

            const [_, ...operations] = await Promise.all([redisUpdatePromise, ...batchOperations])
        }

        if (type === 'published') {
            const startNewExecutionPromises = auctionLots.map((item) => startExecutionAfterPublish(process.env.STATE_MACHINE_LOT_ARN, item))
            await Promise.all(startNewExecutionPromises)
        }
    } catch (error) {
        console.error('Error:', error)
        return {
            status: false,
            message: 'Authentication Failed',
        }
    }
}
