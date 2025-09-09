/* eslint-disable no-plusplus */
/* eslint-disable no-promise-executor-return */
/* eslint-disable no-return-await */
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
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-undef */

const { StepFunctions, config } = require('aws-sdk')
const axios = require('axios')
const mongodbHelper = require('../lib/mongodb_helper')
const StepFunctionArn = require('../entities/stepFunctionArn')
const redisHelper = require('../lib/redis_helper')

let connection = null
const Lot = require('../entities/Lot')

config.update({ region: 'eu-west-2' })

const currentTimeEpoch = Date.now()

// Utility function for delays
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Stop execution with retry logic (following unpublish pattern)
 */
async function stopExecutionWithRetry(executionArn, maxRetries = 3, retryDelay = 1000) {
    console.log(` [STOP] Processing: ${executionArn?.substring(0, 50)}...`)

    const stepFunctions = new StepFunctions()
    const params = {
        executionArn,
        cause: 'User initiated stop for update',
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // First check if execution exists and is running
            const description = await stepFunctions.describeExecution({ executionArn }).promise()

            if (description.status === 'RUNNING') {
                const result = await stepFunctions.stopExecution(params).promise()
                console.log(`[STOP] Successfully stopped: ${executionArn.substring(0, 50)}...`)
                return {
                    success: true,
                    executionArn,
                    result,
                    wasRunning: true,
                }
            } if (['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'].includes(description.status)) {
                console.log(`[STOP] Already completed: ${description.status}`)
                return {
                    success: true,
                    executionArn,
                    status: description.status,
                    alreadyStopped: true,
                }
            }
        } catch (error) {
            if (error.code === 'ThrottlingException' || error.code === 'TooManyRequestsException') {
                if (attempt === maxRetries) {
                    console.error(` [STOP] Failed after ${maxRetries + 1} attempts: ${error.message}`)
                    return {
                        success: false,
                        executionArn,
                        error: error.message,
                        errorCode: error.code,
                    }
                }

                const delay = retryDelay * 2 ** attempt + Math.random() * 1000
                console.log(`[STOP] Throttling detected, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
                await sleep(delay)
                // eslint-disable-next-line no-continue
                continue
            } else {
                console.error(' [STOP] Non-retryable error:', error.message)
                return {
                    success: false,
                    executionArn,
                    error: error.message,
                    errorCode: error.code,
                }
            }
        }
    }
}

/**
 * Start execution with retry logic (following publish pattern)
 */
async function startExecutionWithRetry(stateMachineArn, lot, maxRetries = 3) {
    console.log(` [START] Starting execution for lot: ${lot._id}`)

    const stepfunctions = new StepFunctions()

    // Prepare lot data
    const newStartDate = new Date(lot.start_date).toISOString()
    lot.start_date = newStartDate

    const params = {
        stateMachineArn,
        input: JSON.stringify(lot),
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await stepfunctions.startExecution(params).promise()
            console.log(`[START] Execution started: ${result.executionArn.substring(0, 50)}...`)

            return {
                success: true,
                lot_id: lot._id,
                executionArn: result.executionArn,
                auction_id: lot.auction_id,
                seller_email: lot.seller_email,
            }
        } catch (error) {
            console.error(`[START] Attempt ${attempt + 1} failed for lot ${lot._id}:`, error.message)

            if (attempt === maxRetries - 1) {
                return {
                    success: false,
                    lot_id: lot._id,
                    error: error.message,
                    errorCode: error.code,
                }
            }

            // Wait before retry with exponential backoff
            const waitTime = 2000 * 2 ** attempt
            console.log(`[START] Waiting ${waitTime}ms before retry...`)
            await sleep(waitTime)
        }
    }
}

/**
 * Stop executions in controlled batches (following unpublish pattern)
 */
async function stopExecutionsInBatches(arnRecords, batchSize = 5) {
    const results = []
    const totalBatches = Math.ceil(arnRecords.length / batchSize)

    console.log(`Starting to stop ${arnRecords.length} step functions in ${totalBatches} batches of ${batchSize}`)

    for (let i = 0; i < arnRecords.length; i += batchSize) {
        const batch = arnRecords.slice(i, i + batchSize)
        const batchNumber = Math.floor(i / batchSize) + 1

        console.log(`Processing stop batch ${batchNumber}/${totalBatches} with ${batch.length} executions`)

        const startTime = Date.now()
        const batchPromises = batch.map((record) => stopExecutionWithRetry(record.arn))
        const batchResults = await Promise.allSettled(batchPromises)
        const endTime = Date.now()

        // Convert settled results
        const processedResults = batchResults.map((result, index) => {
            if (result.status === 'fulfilled') {
                return { ...result.value, arnRecord: batch[index] }
            }
            return {
                success: false,
                executionArn: batch[index].arn,
                error: result.reason?.message || 'Unknown error',
                arnRecord: batch[index],
            }
        })

        results.push(...processedResults)

        const successful = processedResults.filter((r) => r.success).length
        const failed = processedResults.length - successful
        console.log(`Stop batch ${batchNumber} completed in ${endTime - startTime}ms: ${successful} successful, ${failed} failed`)

        // Delay between batches to prevent rate limiting
        if (i + batchSize < arnRecords.length) {
            const delay = failed > batchSize * 0.3 ? 2000 : 1000
            console.log(` Waiting ${delay}ms before next stop batch...`)
            await sleep(delay)
        }
    }

    return results
}

/**
 * Start executions in controlled batches (following publish pattern)
 */
async function startExecutionsInBatches(lots, stateMachineArn, batchSize = 3) {
    const results = []
    const totalBatches = Math.ceil(lots.length / batchSize)

    console.log(` Starting ${lots.length} new executions in ${totalBatches} batches of ${batchSize}`)

    for (let i = 0; i < lots.length; i += batchSize) {
        const batch = lots.slice(i, i + batchSize)
        const batchNumber = Math.floor(i / batchSize) + 1

        console.log(`Processing start batch ${batchNumber}/${totalBatches} with ${batch.length} lots`)

        const startTime = Date.now()
        const batchPromises = batch.map((lot) => startExecutionWithRetry(stateMachineArn, lot))
        const batchResults = await Promise.all(batchPromises)
        const endTime = Date.now()

        results.push(...batchResults)

        const successful = batchResults.filter((r) => r.success).length
        const failed = batchResults.length - successful
        console.log(`Start batch ${batchNumber} completed in ${endTime - startTime}ms: ${successful} successful, ${failed} failed`)

        // Longer delay between start batches
        if (i + batchSize < lots.length) {
            console.log('Waiting 1500ms before next start batch...')
            await sleep(1500)
        }
    }

    return results
}

/**
 * Bulk update ARN statuses to ABORTED
 */
async function bulkUpdateArnStatuses(stopResults) {
    const successfulStops = stopResults.filter((r) => r.success && r.wasRunning)

    if (successfulStops.length === 0) {
        console.log('No ARN statuses to update')
        return { modifiedCount: 0 }
    }

    console.log(`[BULK] Updating ${successfulStops.length} ARN statuses to ABORTED...`)

    try {
        const bulkOps = successfulStops.map((stop) => ({
            updateOne: {
                filter: { arn: stop.executionArn },
                update: {
                    $set: {
                        status: 'ABORTED',
                        updated_at: new Date().toISOString(),
                    },
                },
            },
        }))

        const result = await StepFunctionArn.bulkWrite(bulkOps, { ordered: false })
        console.log(`[BULK] Updated ${result.modifiedCount} ARN statuses to ABORTED`)
        return result
    } catch (error) {
        console.error('[BULK] Error updating ARN statuses:', error)
        throw error
    }
}

/**
 * Bulk insert new ARN records
 */
async function bulkInsertNewArnRecords(startResults) {
    const successfulStarts = startResults.filter((r) => r.success)

    if (successfulStarts.length === 0) {
        console.log('No new ARN records to insert')
        return { insertedCount: 0 }
    }

    console.log(`[BULK] Inserting ${successfulStarts.length} new ARN records...`)

    try {
        const newRecords = successfulStarts.map((start) => ({
            arn: start.executionArn,
            lot_id: start.lot_id.toString(),
            auction_id: start.auction_id,
            seller_email: start.seller_email,
            status: 'RUNNING',
            created_at: new Date().toISOString(),
        }))

        const result = await StepFunctionArn.insertMany(newRecords, { ordered: false })
        console.log(`[BULK] Inserted ${result.length} new ARN records`)
        return { insertedCount: result.length }
    } catch (error) {
        console.error(']BULK] Error inserting ARN records:', error)
        throw error
    }
}

/**
 * Update Redis data with comprehensive logging
 */
async function updateRedisData(lotInformation, client) {
    const lot_id = lotInformation._id.toString()
    console.log(`[REDIS] Updating lot: ${lot_id}`)

    try {
        lotInformation.initial_end_time = lotInformation.end_date
        const bidKey = `lot:${lot_id}`

        const existingRecord = await client.hget('lot', bidKey)
        if (!existingRecord) {
            console.warn(`[REDIS] No existing record for lot ${lot_id}`)
            return { success: false, lot_id, error: 'No Redis record found' }
        }

        const get_lot = JSON.parse(existingRecord)
        const updateRequest = {
            ...get_lot,
            lot_end_date: lotInformation.lot_end_time,
            end_date: lotInformation.end_date,
        }
        updateRequest.winning_user = updateRequest.winning_user || ''

        const updatePromise = client
            .multi()
            .hset('lot', bidKey, JSON.stringify(updateRequest))
            .exec()
        await Promise.all([updatePromise])

        // Send notification
        if (process.env.SOCKET_URL) {
            try {
                const payload = { lots: updateRequest }
                const response = await axios({
                    method: 'POST',
                    url: `${process.env.SOCKET_URL}/notification`,
                    headers: {
                        Accept: '*/*',
                        'User-Agent': 'API TEST',
                        'Content-Type': 'application/json',
                    },
                    data: payload,
                })
                console.log(` [REDIS] Updated and notified for lot ${lot_id}`)
                return { success: true, lot_id, response: response.status }
            } catch (error) {
                console.error(` [REDIS] Notification failed for lot ${lot_id}:`, error.message)
                return { success: true, lot_id, notificationError: error.message }
            }
        } else {
            console.log(` [REDIS] Updated lot ${lot_id} (no socket URL)`)
            return { success: true, lot_id }
        }
    } catch (err) {
        console.error(` [REDIS] Error updating lot ${lot_id}:`, err.message)
        return { success: false, lot_id, error: err.message }
    }
}

/**
 * Update Redis data for all lots
 */
async function updateAllRedisData(auctionLots, client, extend_time) {
    console.log(` [REDIS] Starting Redis updates for ${auctionLots.length} lots`)

    try {
        const redisDataUpdate = []
        for (const item of auctionLots) {
            item.lot_end_time = item.end_date + extend_time
            if (item.end_date > currentTimeEpoch) {
                redisDataUpdate.push(updateRedisData(item, client))
            }
        }

        const results = await Promise.allSettled(redisDataUpdate)
        const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length
        const failed = results.filter((r) => r.status === 'rejected' || !r.value.success).length

        console.log(` [REDIS] Updates completed: ${successful} successful, ${failed} failed`)
        return { successful, failed, results }
    } catch (err) {
        console.error(' [REDIS] Error in updateAllRedisData:', err)
        throw err
    }
}

/**
 * Handle ended lots - mark them as completed and clean up ARN records
 */
async function handleEndedLots(endedLots) {
    if (endedLots.length === 0) return { lotsUpdated: 0, arnsUpdated: 0 }

    console.log(` [ENDED] Handling ${endedLots.length} ended lots`)

    try {
        // Bulk update ARN records for ended lots to COMPLETED
        const arnUpdateOps = endedLots.map((lot) => ({
            updateOne: {
                filter: {
                    lot_id: lot._id.toString(),
                    auction_id: lot.auction_id,
                    seller_email: lot.seller_email,
                },
                update: {
                    $set: {
                        status: 'COMPLETED',
                        updated_at: new Date().toISOString(),
                    },
                },
            },
        }))

        // Execute ARN bulk operations
        const arnResult = await StepFunctionArn.bulkWrite(arnUpdateOps, { ordered: false })

        console.log(` [ENDED] Updated ${arnResult.modifiedCount} ARN records to COMPLETED`)

        return {
            lotsUpdated: endedLots.length,
            arnsUpdated: arnResult.modifiedCount,
        }
    } catch (error) {
        console.error(' [ENDED] Error handling ended lots:', error)
        return { lotsUpdated: 0, arnsUpdated: 0, error: error.message }
    }
}

/**
 * Main optimized update handler following publish/unpublish patterns
 */
module.exports.updateHandler = async (event, context) => {
    const startTime = Date.now()
    const timeoutBuffer = 60000 // Following publish pattern
    const timeoutTime = Date.now() + (context.getRemainingTimeInMillis() - timeoutBuffer)

    console.log(' ===== IMPROVED UPDATE HANDLER STARTED =====')
    console.log(' Event:', JSON.stringify(event, null, 2))
    console.log(' Remaining time:', context.getRemainingTimeInMillis())

    try {
        // MongoDB connection
        if (connection === null || !connection.readyState) {
            console.log(' Connecting to MongoDB...')
            connection = await mongodbHelper.connect()
            console.log(' MongoDB connected')
        }

        const { lots, auction } = event
        const auctionLots = lots
        const auctionDetails = auction

        if (!auctionLots || !Array.isArray(auctionLots) || auctionLots.length === 0) {
            throw new Error('No lots provided or lots is not an array')
        }

        if (!auctionDetails || !auctionDetails.extension_time) {
            throw new Error('No auction details or extension_time provided')
        }

        console.log(` Processing ${auctionLots.length} lots`)

        // Redis setup
        const client = await redisHelper.createRedisClient()
        const extend_time = parseInt(auctionDetails.extension_time.replace('m', ''), 10) * 60 * 1000

        // PHASE 1: Update Redis data
        console.log(' ===== PHASE 1: UPDATING REDIS DATA =====')
        const redisResults = await updateAllRedisData(auctionLots, client, extend_time)

        // PHASE 2: Separate active and ended lots
        const activeLots = auctionLots.filter((item) => {
            item.lot_end_time = item.end_date + extend_time
            return item.end_date > currentTimeEpoch
        })

        const endedLots = auctionLots.filter((item) => {
            item.lot_end_time = item.end_date + extend_time
            return item.end_date <= currentTimeEpoch
        })

        console.log(` Found ${activeLots.length} active lots and ${endedLots.length} ended lots`)

        // Handle ended lots in parallel
        let endedLotsResult = { lotsUpdated: 0, arnsUpdated: 0 }
        if (endedLots.length > 0) {
            endedLotsResult = await handleEndedLots(endedLots)
        }

        if (activeLots.length === 0) {
            return {
                success: true,
                message: 'No active lots to update',
                summary: {
                    total_lots: auctionLots.length,
                    active_lots: 0,
                    ended_lots: endedLots.length,
                    ended_lots_processed: endedLotsResult,
                    redis_results: redisResults,
                },
                timestamp: new Date().toISOString(),
                execution_time_ms: Date.now() - startTime,
            }
        }

        // PHASE 3: Get ALL execution ARNs upfront (following unpublish pattern)
        console.log(' ===== PHASE 3: RETRIEVING ALL EXECUTION ARNS UPFRONT =====')

        // Get all ARN records for this auction in one query
        const arnRecords = await StepFunctionArn.find({
            auction_id: auctionDetails.auction_id,
            seller_email: auctionDetails.seller_email,
            status: 'RUNNING',
        })

        console.log(` Found ${arnRecords.length} ARN records in database`)

        // Create a map for quick lookup
        const arnMap = new Map()
        arnRecords.forEach((record) => {
            arnMap.set(record.lot_id.toString(), record)
        })

        // Match active lots with their ARN records
        const lotsWithArns = activeLots.filter((lot) => arnMap.has(lot._id.toString()))
        const lotsWithoutArns = activeLots.filter((lot) => !arnMap.has(lot._id.toString()))

        console.log(` ARN Matching: ${lotsWithArns.length} lots with ARNs, ${lotsWithoutArns.length} without ARNs`)

        if (lotsWithArns.length === 0) {
            return {
                success: false,
                message: 'No lots with valid execution ARNs found',
                summary: {
                    total_lots: auctionLots.length,
                    active_lots: activeLots.length,
                    ended_lots: endedLots.length,
                    ended_lots_processed: endedLotsResult,
                    lots_with_arns: 0,
                    lots_without_arns: lotsWithoutArns.length,
                    redis_results: redisResults,
                },
                timestamp: new Date().toISOString(),
                execution_time_ms: Date.now() - startTime,
            }
        }

        // Get the ARN records we need to process
        const arnRecordsToProcess = lotsWithArns.map((lot) => arnMap.get(lot._id.toString()))

        // PHASE 4: Stop all executions in controlled batches
        console.log(' ===== PHASE 4: STOPPING ALL EXECUTIONS =====')
        const stopResults = await stopExecutionsInBatches(arnRecordsToProcess, 5)

        // PHASE 5: Bulk update ARN statuses to ABORTED
        console.log(' ===== PHASE 5: BULK UPDATING ARN STATUSES =====')
        await bulkUpdateArnStatuses(stopResults)

        // PHASE 6: Wait for AWS cleanup
        console.log(' ===== PHASE 6: WAITING FOR AWS CLEANUP =====')
        await sleep(1500)

        // Check timeout before starting new executions
        if (Date.now() > timeoutTime) {
            console.warn(' Approaching timeout, cannot start new executions')
            return {
                success: false,
                message: 'Timeout reached after stop phase',
                summary: {
                    total_lots: auctionLots.length,
                    active_lots: activeLots.length,
                    ended_lots: endedLots.length,
                    ended_lots_processed: endedLotsResult,
                    lots_with_arns: lotsWithArns.length,
                    stop_completed: true,
                    start_completed: false,
                    redis_results: redisResults,
                },
                timestamp: new Date().toISOString(),
                execution_time_ms: Date.now() - startTime,
            }
        }

        // PHASE 7: Start all new executions in controlled batches
        console.log(' ===== PHASE 7: STARTING ALL NEW EXECUTIONS =====')
        const startResults = await startExecutionsInBatches(
            lotsWithArns,
            process.env.STATE_MACHINE_LOT_ARN,
            3,
        )

        // PHASE 8: Bulk insert new ARN records
        console.log(' ===== PHASE 8: BULK INSERTING NEW ARN RECORDS =====')
        await bulkInsertNewArnRecords(startResults)

        // Final results
        const stopSuccessful = stopResults.filter((r) => r.success).length
        const stopFailed = stopResults.filter((r) => !r.success).length
        const startSuccessful = startResults.filter((r) => r.success).length
        const startFailed = startResults.filter((r) => !r.success).length

        const totalTime = Date.now() - startTime
        const response = {
            success: stopFailed === 0 && startFailed === 0,
            approach: 'improved_bulk_operations_with_proper_batching',
            summary: {
                total_lots: auctionLots.length,
                active_lots: activeLots.length,
                ended_lots: endedLots.length,
                ended_lots_processed: endedLotsResult,
                lots_with_arns: lotsWithArns.length,
                lots_without_arns: lotsWithoutArns.length,
                stop_successful: stopSuccessful,
                stop_failed: stopFailed,
                start_successful: startSuccessful,
                start_failed: startFailed,
                execution_time_ms: totalTime,
                redis_results: redisResults,
            },
            phases: {
                stop_phase: {
                    successful: stopSuccessful,
                    failed: stopFailed,
                    sample_failures: stopResults.filter((r) => !r.success).slice(0, 3).map((f) => ({
                        error: f.error,
                        errorCode: f.errorCode,
                    })),
                },
                start_phase: {
                    successful: startSuccessful,
                    failed: startFailed,
                    sample_failures: startResults.filter((r) => !r.success).slice(0, 3).map((f) => ({
                        lot_id: f.lot_id,
                        error: f.error,
                        errorCode: f.errorCode,
                    })),
                },
                ended_lots_phase: endedLotsResult,
            },
            timestamp: new Date().toISOString(),
        }

        console.log(' ===== IMPROVED UPDATE HANDLER COMPLETED =====')
        console.log(' Final summary:', response.summary)

        return response
    } catch (error) {
        console.error(' ===== UPDATE HANDLER ERROR =====')
        console.error(' Error details:', {
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 5).join('\n'),
        })

        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            execution_time_ms: Date.now() - startTime,
            summary: {
                total_lots: event.lots ? event.lots.length : 0,
                active_lots: 0,
                ended_lots: 0,
                lots_with_arns: 0,
                stop_successful: 0,
                stop_failed: 0,
                start_successful: 0,
                start_failed: 0,
            },
        }
    }
}

/**
 * Main handler
 */
module.exports.handler = async (event, context) => {
    try {
        const { type } = event

        if (type === 'update') {
            return await module.exports.updateHandler(event, context)
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
