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

const { StepFunctions, config } = require('aws-sdk')
const mongodbHelper = require('./mongodb_helper')
const StepFunctionArn = require('../entities/stepFunctionArn')

mongodbHelper.connect()

config.update({ region: 'eu-west-2' })

/**
 * Start an execution of the state machine for the given execution ARN.
 *
 * @param {string} executionARN - The ARN of the state machine to execute
 * @param {Object} lots - The lots to pass to the state machine
 * @returns {Promise} A promise that resolves with the data from the startExecution call if successful,
 * or rejects with an error
 */
module.exports.startExecution = async (executionARN, lots) => {
    try {
        // Log that the state machine is being started
        console.log('execution starteddd')
        // Create a new StepFunctions client
        const stepfunctions = new StepFunctions()
        // Convert the start_date to an ISO string
        const newStartDate = new Date(lots.start_date).toISOString()
        // Set the start_date on the lots object to the ISO string
        lots.start_date = newStartDate
        // Set up the parameters for the startExecution call
        const params = {
            stateMachineArn: executionARN,
            // Stringify the lots object and use it as the input to the state machine
            input: JSON.stringify(lots),
        }

        return new Promise((resolve, reject) => {
            // Start the state machine execution
            stepfunctions.startExecution(params, async (error, data) => {
                // If there is an error, reject the promise with that error
                if (error) {
                    reject(error)
                }
                // If there is data, update the MongoDB record with the execution ARN
                if (data) {
                    // Get the execution ARN from MongoDB
                    const getArn = await mongodbHelper.getExecutionArn(lots, StepFunctionArn)
                    // Update the MongoDB record with the execution ARN
                    await mongodbHelper.updateArn(getArn, data, StepFunctionArn)
                    // Resolve the promise with the data
                    resolve(data)
                }
                // If there is no data, resolve the promise with an object with a status of false
                resolve({ status: false })
            })
        })
    } catch (err) {
        // Log the error to the console
        console.log('start err', err)
    }
}

/**
 * Start the execution of the state machine after the auction is published.
 * @param {string} executionARN - The ARN of the state machine
 * @param {Object} lots - The auction lot data
 * @returns {Promise<Object>} - The data returned from the startExecution call
 */
module.exports.startExecutionAfterPublish = async (executionARN, lots) => {
    try {
        const stepfunctions = new StepFunctions()
        // Set the start date to the ISO string, which is required by the state machine
        const newStartDate = new Date(lots.start_date).toISOString()
        lots.start_date = newStartDate
        // Set the parameters for the startExecution call
        const params = {
            stateMachineArn: executionARN,
            input: JSON.stringify(lots),
        }
        return new Promise((resolve, reject) => {
            // Start the execution of the state machine
            stepfunctions.startExecution(params, async (error, data) => {
                if (error) {
                    // If there is an error, reject the promise
                    reject(error)
                }
                if (data) {
                    // If there is data, save the execution ARN to the DB and resolve the promise with the data
                    const requestPayload = {
                        arn: data.executionArn,
                        lot_id: lots._id.toString(),
                        auction_id: lots.auction_id,
                        seller_email: lots.seller_email,
                    }
                    await mongodbHelper.save(requestPayload, StepFunctionArn)
                    resolve(data)
                }
                // If there is no data, resolve the promise with an object with a status of false
                resolve({ status: false })
            })
        })
    } catch (err) {
        console.log('start err', err)
    }
}

/**
 * Stops an execution of the state machine for the given execution ARN.
 *
 * @param {string} executionArn - The ARN of the state machine execution to stop
 * @returns {Promise} A promise that resolves with the data from the stopExecution call if successful,
 * or rejects with an error
 */

module.exports.stopExecutions = async (executionArn) => {
    try {
        // Log that the state machine execution is being stopped
        console.log('INSIDE STOP: ')
        // Create a new StepFunctions client
        const stepFunctions = new StepFunctions()
        // Set up the parameters for the stopExecution call
        const params = {
            executionArn,
            // Set the cause of the stop to 'User initiated stop'
            cause: 'User initiated stop',
        }
        return new Promise((resolve, reject) => {
            // Stop the state machine execution
            stepFunctions.stopExecution(params, async (error, data) => {
                // If there is an error, reject the promise with that error
                if (error) {
                    reject(error)
                }
                // If there is data, resolve the promise with that data
                if (data) {
                    resolve(data)
                }
                // If there is no data, resolve the promise with an object with a status of false
                resolve({ status: false })
            })
        })
    } catch (err) {
        // Log the error to the console
        console.log('errr ioreds', err)
    }
}
