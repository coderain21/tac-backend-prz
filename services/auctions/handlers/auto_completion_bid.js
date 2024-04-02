/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-plusplus */
/* eslint-disable no-param-reassign */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-restricted-syntax */
/* eslint-disable camelcase */
/* eslint-disable array-callback-return */
/* eslint-disable no-await-in-loop */
const splitArray = require('split-array')
const uuid = require('uuid')

const AWS = require('aws-sdk')
const mongodbHelper = require('../lib/mongodb_helper')

const queueUrl = process.env.QUEUE_URL

AWS.config.update({ region: 'eu-west-2' })
const sqs = new AWS.SQS()

/**
 * Function to fetches bidders using an asynchronous MongoDB helper function
 * connects to Redis, retrieves auction lots from Redis
 * splits the bidders into chunks,
and sends them to an AWS Simple Queue Service (SQS) in batches for further processing.
 *
 * @param {object} event - Auction details.
 *  @param {object} lot information - to retriew the lot to redis cache.
 * @returns {object} true
 */
module.exports.handler = async (event) => {
    try {
        const getBidders = await mongodbHelper.getBidders(event)
        const splittedUsers = splitArray(getBidders, 25)
        const params = {
            QueueUrl: queueUrl,
            Entries: [],
        }
        for (const user of splittedUsers) {
            const id = uuid.v4()
            params.Entries.push({
                Id: id,
                MessageBody: JSON.stringify(user),
                MessageDeduplicationId: uuid.v4(),
                MessageGroupId: uuid.v4(),
            })
        }
        await new Promise((resolve, reject) => {
            sqs.sendMessageBatch(params, (error, data) => {
                if (error) reject(error)
                resolve(data)
            })
        })
        return event
    } catch (err) {
        return err
    }
}
