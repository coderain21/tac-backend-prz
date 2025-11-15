/* eslint-disable no-promise-executor-return */
/* eslint-disable no-plusplus */
/* eslint-disable no-multiple-empty-lines */
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
/* eslint-disable no-undef */

const { StepFunctions, config } = require('aws-sdk')
const mongodbHelper = require('../lib/mongodb_helper')
const StepFunctionArn = require('../entities/stepFunctionArn')

let connection = null

config.update({ region: 'eu-west-2' })

/**
 * Starts an execution of the state machine after the auction is published.
 *
 * @param {string} executionARN - The ARN of the state machine
 * @param {Object} lots - The auction lot data
 * @returns {Promise<Object>} - The data returned from the startExecution call
 */
async function startExecutionAfterPublish(executionARN, lots) {
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
                    console.log('startExecutionAfterPublish error:', error)
                    reject(error)
                    return
                }

                if (data) {
                    try {
                        // Save the execution ARN to the DB
                        const requestPayload = {
                            arn: data.executionArn,
                            lot_id: lots._id.toString(),
                            auction_id: lots.auction_id,
                            seller_email: lots.seller_email,
                            status: 'RUNNING',
                            created_at: new Date().toISOString(),
                        }

                        console.log('--- DEBUG: Payload before save ---', JSON.stringify(requestPayload, null, 2))
                        const saveResult = await mongodbHelper.save(requestPayload, StepFunctionArn)
                        console.log('MongoDB save result:', saveResult)

                        resolve(data)
                    } catch (saveError) {
                        console.error('Error saving to MongoDB:', saveError)
                        // Still resolve with data since execution started successfully
                        resolve(data)
                    }
                    return
                }

                // If there is no data, resolve the promise with an object with a status of false
                resolve({ status: false })
            })
        })
    } catch (err) {
        // Log the error to the console
        console.log('startExecutionAfterPublish catch error:', err)
        throw err
    }
}

/**
 * Start execution with retry logic for publishing
 */
async function startExecutionWithRetry(executionARN, lots, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`Publish attempt ${i + 1} for lot ${lots._id}`)
            const result = await startExecutionAfterPublish(executionARN, lots)

            if (result && result.executionArn) {
                console.log(`Successfully started execution for lot ${lots._id}: ${result.executionArn}`)
                return result
            }

            if (result && result.status === false) {
                throw new Error('Step function returned status false')
            }
        } catch (error) {
            console.error(`Publish attempt ${i + 1} failed for lot ${lots._id}:`, error)

            if (i === maxRetries - 1) {
                throw error
            }

            // Wait before retry with exponential backoff
            const waitTime = 2000 * 2 ** i
            console.log(`Waiting ${waitTime}ms before retry...`)
            await new Promise((resolve) => setTimeout(resolve, waitTime))
        }
    }

    throw new Error(`Failed to start execution after ${maxRetries} attempts`)
}

/**
 * AWS Lambda function to handle auction publishing
 * This function starts new step function executions for all lots when an auction is published
 *
 * @param {Object} event - Event data containing lots array
 * @param {Object} context - AWS Lambda context object
 * @returns {Object} - Object with status and results
 */
module.exports.publishHandler = async (event, context) => {
    // Set Lambda timeout context
    const timeoutBuffer = 30000 // 30 seconds buffer
    const timeoutTime = Date.now() + (context.getRemainingTimeInMillis() - timeoutBuffer)

    try {
        console.log('=== PUBLISH HANDLER STARTED ===')
        console.log('Event:', JSON.stringify(event, null, 2))
        console.log('Context remaining time:', context.getRemainingTimeInMillis())

        // Ensure MongoDB connection
        if (connection === null || !connection.readyState) {
            console.log('Connecting to MongoDB...')
            connection = await mongodbHelper.connect()
        }

        const { lots } = event

        if (!lots || !Array.isArray(lots) || lots.length === 0) {
            throw new Error('No lots provided or lots is not an array')
        }

        const auctionLots = lots
        console.log(`Starting publish process for ${auctionLots.length} lots`)

        // Validate environment variables
        if (!process.env.STATE_MACHINE_LOT_ARN) {
            throw new Error('STATE_MACHINE_LOT_ARN environment variable not set')
        }

        // Process all lots in parallel for publishing with concurrency limit
        const concurrencyLimit = 5 // Process 5 lots at a time to avoid overwhelming Step Functions
        const publishResults = []

        for (let i = 0; i < auctionLots.length; i += concurrencyLimit) {
            // Check timeout
            if (Date.now() > timeoutTime) {
                console.warn('Approaching timeout, stopping processing')
                break
            }

            const batch = auctionLots.slice(i, i + concurrencyLimit)
            console.log(`Processing batch ${Math.floor(i / concurrencyLimit) + 1}: lots ${i + 1} to ${Math.min(i + concurrencyLimit, auctionLots.length)}`)

            const batchPromises = batch.map(async (item, batchIndex) => {
                const globalIndex = i + batchIndex
                try {
                    // Validate lot data
                    if (!item._id || !item.auction_id || !item.seller_email) {
                        throw new Error('Missing required lot fields: _id, auction_id, or seller_email')
                    }

                    console.log(`Publishing lot ${globalIndex + 1}/${auctionLots.length}: ${item._id}`)

                    const result = await startExecutionWithRetry(
                        process.env.STATE_MACHINE_LOT_ARN,
                        item,
                    )

                    if (!result || result.status === false) {
                        throw new Error('Step function execution failed')
                    }

                    console.log(`✅ Successfully published lot ${item._id}`)
                    return {
                        success: true,
                        lot_id: item._id,
                        lot_number: item.lot_number || globalIndex + 1,
                        executionArn: result.executionArn,
                        auction_id: item.auction_id,
                    }
                } catch (error) {
                    console.error(`❌ Error publishing lot ${item._id}:`, error)
                    return {
                        success: false,
                        lot_id: item._id,
                        lot_number: item.lot_number || globalIndex + 1,
                        error: error.message,
                        auction_id: item.auction_id,
                    }
                }
            })

            // Wait for current batch to complete
            const batchResults = await Promise.all(batchPromises)
            publishResults.push(...batchResults)

            // Small delay between batches to prevent rate limiting
            if (i + concurrencyLimit < auctionLots.length) {
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        }

        // Calculate final results
        const successful = publishResults.filter((r) => r.success)
        const failed = publishResults.filter((r) => !r.success)

        console.log('=== PUBLISH SUMMARY ===')
        console.log(`Total lots: ${auctionLots.length}`)
        console.log(`Processed: ${publishResults.length}`)
        console.log(`Successful: ${successful.length}`)
        console.log(`Failed: ${failed.length}`)

        if (failed.length > 0) {
            console.error('Failed lots details:', failed)
        }

        const response = {
            success: failed.length === 0, // Only true if no failures
            total: auctionLots.length,
            processed: publishResults.length,
            successful: successful.length,
            failed: failed.length,
            results: publishResults,
            timestamp: new Date().toISOString(),
            executionTime: Date.now() - (timeoutTime - context.getRemainingTimeInMillis() + timeoutBuffer),
        }

        console.log('=== PUBLISH HANDLER COMPLETED ===')
        console.log('Final response:', JSON.stringify(response, null, 2))

        return response
    } catch (error) {
        console.error('=== PUBLISH HANDLER ERROR ===')
        console.error('Error details:', error)
        console.error('Stack trace:', error.stack)

        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            total: event.lots ? event.lots.length : 0,
            processed: 0,
            successful: 0,
            failed: event.lots ? event.lots.length : 0,
        }
    }
}

/**
 * Main handler that can route to publish or other functions
 */
module.exports.handler = async (event, context) => {
    try {
        const { type } = event

        if (type === 'published') {
            return await module.exports.publishHandler(event, context)
        }
        throw new Error(`Unsupported event type: ${type}`)
    } catch (error) {
        console.error('Main Handler Error:', error)
        return {
            success: false,
            error: error.message,
            type: event.type || 'unknown',
        }
    }
}
