/* eslint-disable no-plusplus */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-plusplus */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const { StepFunctions, config } = require('aws-sdk')
const mongoConnection = require('../lib/mongodb_helper')
const StepFunctionArn = require('../entities/stepFunctionArn')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')

config.update({ region: 'eu-west-2' })

let connection = null

// Copy these functions from your main file:
function sleep(ms) {
    // eslint-disable-next-line no-promise-executor-return
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// eslint-disable-next-line consistent-return
async function stopExecutions(executionArn, maxRetries = 3, retryDelay = 1000) {
    console.log('INSIDE STOP: ', executionArn)
    const stepFunctions = new StepFunctions()
    const params = {
        executionArn,
        cause: 'User initiated stop',
    }

    // Replace for loop with recursive function
    async function attemptStop(attempt = 0) {
        try {
            return new Promise((resolve, reject) => {
                stepFunctions.stopExecution(params, async (error, data) => {
                    if (error) {
                        if (error.code === 'ThrottlingException' || error.code === 'TooManyRequestsException') {
                            reject(error)
                        } else {
                            console.error(`Non-retryable error stopping execution ${executionArn}:`, error)
                            resolve({ status: false, error: error.message })
                        }
                    } else if (data) {
                        resolve({ status: true, data })
                    } else {
                        resolve({ status: false })
                    }
                })
            })
        } catch (error) {
            if (attempt === maxRetries) {
                console.error(`Failed to stop execution ${executionArn} after ${maxRetries + 1} attempts:`, error)
                return { status: false, error: error.message }
            }

            const delay = retryDelay * 2 ** attempt + Math.random() * 1000
            console.log(`Throttling detected for ${executionArn}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
            await sleep(delay)
            return attemptStop(attempt + 1)
        }
    }

    return attemptStop()
}

async function stopExecutionsInBatches(arns, arnRecords, batchSize = 100) {
    const results = []
    const totalBatches = Math.ceil(arns.length / batchSize)

    console.log(`Starting to stop ${arns.length} step functions in ${totalBatches} batches of ${batchSize}`)

    // Replace for loop with recursive batch processing
    async function processBatch(batchIndex = 0) {
        const start = batchIndex * batchSize
        const end = start + batchSize
        const batch = arns.slice(start, end)

        if (batch.length === 0) return

        const batchNumber = batchIndex + 1
        console.log(`Processing batch ${batchNumber}/${totalBatches} with ${batch.length} executions`)

        const startTime = Date.now()
        const batchPromises = batch.map((arn) => stopExecutions(arn))
        const batchResults = await Promise.allSettled(batchPromises)
        const endTime = Date.now()

        results.push(...batchResults)

        const successful = batchResults.filter((result) => result.status === 'fulfilled' && result.value.status).length
        const failed = batchResults.length - successful
        console.log(`Batch ${batchNumber} completed in ${endTime - startTime}ms: ${successful} successful, ${failed} failed`)

        // Continue to next batch if there are more
        if (batchIndex < totalBatches - 1) {
            const delay = failed > batchSize * 0.3 ? 2000 : 1000
            await sleep(delay)
            await processBatch(batchIndex + 1)
        }
    }

    await processBatch()

    const totalSuccessful = results.filter((result) => result.status === 'fulfilled' && result.value.status).length
    const totalFailed = results.length - totalSuccessful
    console.log(`All batches completed: ${totalSuccessful}/${arns.length} successful, ${totalFailed} failed`)

    // Replace for loop with Promise.all and map
    await Promise.all(arnRecords.map(async (arnRecord, i) => {
        const result = results[i]

        try {
            if (result.status === 'fulfilled' && result.value.status) {
                // Successfully stopped
                await mongoConnection.update(StepFunctionArn, arnRecord._id.toString(), {
                    status: 'ABORTED',
                    stopped_at: Math.floor(Date.now() / 1000),
                })
            } else {
                // Failed to stop
                await mongoConnection.update(StepFunctionArn, arnRecord._id.toString(), {
                    status: 'STOP_FAILED',
                    stop_error: result.reason || 'Unknown error',
                    failed_at: Math.floor(Date.now() / 1000),
                })
            }
        } catch (error) {
            console.error(`Failed to update final status for ARN ${arnRecord._id}:`, error)
        }
    }))

    return results
}

async function updateArnStatusToAborted(arnRecords) {
    const updateResults = []
    const updateErrors = []

    console.log(`Updating ${arnRecords.length} ARN records to ABORTED status`)

    // Replace for...of loop with Promise.all and map
    await Promise.all(arnRecords.map(async (record) => {
        try {
            await mongoConnection.update(StepFunctionArn, record._id.toString(), { status: 'ABORTED' })
            updateResults.push({ id: record._id, arn: record.arn, status: 'updated' })
            console.log(`Successfully updated ARN record ${record._id} to ABORTED`)
        } catch (error) {
            console.error(`Failed to update ARN record ${record._id}:`, error.message)
            updateErrors.push({ id: record._id, arn: record.arn, error: error.message })
        }
    }))

    return { updateResults, updateErrors }
}

module.exports.handler = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const {
            arnRecords, seller_email, auction_id, operation_type,
        } = event

        console.log(`Starting cleanup for ${arnRecords.length} step functions - auction ${auction_id}, operation: ${operation_type}`)

        const runningArns = arnRecords.map((item) => item.arn)

        // Stop step functions in small batches
        const stopResults = await stopExecutionsInBatches(runningArns, arnRecords, 100)

        // Update ARN statuses to ABORTED
        const { updateResults, updateErrors } = await updateArnStatusToAborted(arnRecords)

        // Update lot statuses based on operation type
        // if (operation_type === 'UNPUBLISH') {
        //     const runningLots = await mongoConnection.view(Lot, { auction_id, status: 'RUNNING' })
        //     // Replace for...of with Promise.all
        //     await Promise.all(runningLots.map(async (lot) => {
        //         try {
        //             await mongoConnection.update(Lot, lot._id.toString(), { status: 'ABORTED' })
        //         } catch (error) {
        //             console.error(`Failed to update lot ${lot._id} status:`, error.message)
        //         }
        //     }))
        // } else if (operation_type === 'CANCEL') {
        //     const runningLots = await mongoConnection.view(Lot, { auction_id, status: { $in: ['RUNNING', 'PENDING'] } })
        //     // Replace for...of with Promise.all
        //     await Promise.all(runningLots.map(async (lot) => {
        //         try {
        //             await mongoConnection.update(Lot, lot._id.toString(), { status: 'ABORTED' })
        //         } catch (error) {
        //             console.error(`Failed to update lot ${lot._id} status:`, error.message)
        //         }
        //     }))
        // }

        // // Update auction with completion status
        // await mongoConnection.update(Auction, auction_id, {
        //     step_functions_stopped_at: Math.floor(Date.now() / 1000),
        //     background_cleanup_completed: true,
        // })

        console.log(`✅ Cleanup completed: ${updateResults.length} ARNs updated, operation: ${operation_type}`)
    } catch (error) {
        console.error('Cleanup lambda failed:', error)

        // Replace for...of loop with Promise.all and map
        await Promise.all((arnRecords || []).map(async (record) => {
            try {
                await mongoConnection.update(StepFunctionArn, record._id.toString(), {
                    status: 'STOP_FAILED',
                    stop_error: error.message,
                    failed_at: Math.floor(Date.now() / 1000),
                })
            } catch (updateError) {
                console.error(`Failed to update ARN ${record._id}:`, updateError)
            }
        }))
        throw error // Re-throw so Lambda marks it as failed
    }
}
