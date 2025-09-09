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

/**
 * Bulk update ARN statuses to ABORTED after successful stops
 */
async function bulkUpdateArnStatuses(successfulStops) {
    if (successfulStops.length === 0) return { modifiedCount: 0 }

    console.log(`💾 [BULK] Updating ${successfulStops.length} ARN statuses to ABORTED...`)

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
        console.log(`✅ [BULK] Updated ${result.modifiedCount} ARN statuses to ABORTED`)
        return result
    } catch (error) {
        console.error('❌ [BULK] Error updating ARN statuses:', error)
        throw error
    }
}

/**
 * Bulk insert new ARN records after successful starts
 */
async function bulkInsertNewArnRecords(successfulStarts) {
    if (successfulStarts.length === 0) return { insertedCount: 0 }

    console.log(`💾 [BULK] Inserting ${successfulStarts.length} new ARN records...`)

    try {
        const bulkOps = successfulStarts.map((start) => ({
            insertOne: {
                document: {
                    arn: start.executionArn,
                    lot_id: start.lot_id.toString(),
                    auction_id: start.auction_id,
                    seller_email: start.seller_email,
                    status: 'RUNNING',
                    created_at: new Date().toISOString(),
                },
            },
        }))

        const result = await StepFunctionArn.bulkWrite(bulkOps, { ordered: false })
        console.log(`✅ [BULK] Inserted ${result.insertedCount} new ARN records`)
        return result
    } catch (error) {
        console.error('❌ [BULK] Error inserting ARN records:', error)
        throw error
    }
}

/**
 * Handle ended lots - mark them as completed and clean up ARN records
 */
async function handleEndedLots(endedLots) {
    if (endedLots.length === 0) return { lotsUpdated: 0, arnsUpdated: 0 }

    console.log(`📋 [ENDED] Handling ${endedLots.length} ended lots`)

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

        console.log(`✅ [ENDED] Updated ${arnResult.modifiedCount} ARN records to COMPLETED`)

        return {
            lotsUpdated: endedLots.length,
            arnsUpdated: arnResult.modifiedCount,
        }
    } catch (error) {
        console.error('❌ [ENDED] Error handling ended lots:', error)
        return { lotsUpdated: 0, arnsUpdated: 0, error: error.message }
    }
}

/**
 * Stops an execution without individual database updates
 */
async function stopExecutionWithValidation(executionArn) {
    console.log(`🛑 [STOP] Processing: ${executionArn}`)

    try {
        if (!executionArn || typeof executionArn !== 'string') {
            console.error(`❌ [STOP] Invalid executionArn: ${executionArn}`)
            return {
                success: false,
                executionArn,
                error: 'Invalid executionArn provided',
                stage: 'validation',
            }
        }

        const stepFunctions = new StepFunctions()
        const describeParams = { executionArn }

        try {
            const description = await stepFunctions.describeExecution(describeParams).promise()
            console.log(`✅ [STOP] Current status: ${description.status}`)

            if (description.status === 'RUNNING') {
                const params = {
                    executionArn,
                    cause: 'User initiated stop for update',
                }

                const result = await stepFunctions.stopExecution(params).promise()
                console.log(`✅ [STOP] Successfully stopped: ${executionArn.substring(0, 50)}...`)

                // ✅ DON'T UPDATE DATABASE HERE - WILL BE DONE IN BULK
                return {
                    success: true,
                    executionArn,
                    result,
                    status: 'stopped',
                    wasRunning: true,
                    stage: 'stopped',
                }
            } if (['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'].includes(description.status)) {
                console.log(`✅ [STOP] Already completed: ${description.status}`)
                return {
                    success: true,
                    executionArn,
                    status: description.status,
                    alreadyStopped: true,
                    stage: 'already_completed',
                }
            }
        } catch (describeError) {
            console.error('❌ [STOP] Describe failed:', describeError)
            return {
                success: false,
                executionArn,
                error: `Describe failed: ${describeError.message}`,
                errorCode: describeError.code,
                stage: 'describe',
            }
        }
    } catch (err) {
        console.error('❌ [STOP] Unexpected error:', err)
        return {
            success: false,
            executionArn,
            error: `Unexpected error: ${err.message}`,
            errorCode: err.code,
            stage: 'unexpected_error',
        }
    }
}

/**
 * Starts a new execution without individual database updates
 */
async function startExecutionForUpdate(executionARN, lots) {
    console.log(`🚀 [START] Starting execution for lot: ${lots._id}`)

    try {
        if (!executionARN || !lots || !lots._id) {
            console.error(`❌ [START] Invalid parameters for lot ${lots._id}`)
            return {
                success: false,
                lot_id: lots._id || 'unknown',
                error: 'Invalid parameters provided',
                stage: 'validation',
            }
        }

        const stepfunctions = new StepFunctions()
        const newStartDate = new Date(lots.start_date).toISOString()
        lots.start_date = newStartDate

        const params = {
            stateMachineArn: executionARN,
            input: JSON.stringify(lots),
        }

        console.log(`🚀 [START] Calling startExecution API for lot ${lots._id}...`)
        const result = await stepfunctions.startExecution(params).promise()
        console.log(`✅ [START] Execution started: ${result.executionArn.substring(0, 50)}...`)

        // ✅ DON'T SAVE TO DATABASE HERE - WILL BE DONE IN BULK
        return {
            success: true,
            lot_id: lots._id,
            executionArn: result.executionArn,
            auction_id: lots.auction_id,
            seller_email: lots.seller_email,
            stage: 'completed',
        }
    } catch (err) {
        console.error(`❌ [START] Error starting execution for lot ${lots._id}:`, {
            message: err.message,
            code: err.code,
            statusCode: err.statusCode,
        })
        return {
            success: false,
            lot_id: lots._id,
            error: err.message,
            errorCode: err.code,
            stage: 'execution_failed',
        }
    }
}

/**
 * Updates Redis data with comprehensive logging
 */
async function updateRedisData(lotInformation, client) {
    const lot_id = lotInformation._id.toString()
    console.log(`🗃️ [REDIS] Updating lot: ${lot_id}`)

    try {
        lotInformation.initial_end_time = lotInformation.end_date
        const bidKey = `lot:${lot_id}`

        const existingRecord = await client.hget('lot', bidKey)
        if (!existingRecord) {
            console.warn(`⚠️ [REDIS] No existing record for lot ${lot_id}`)
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
                console.log(`✅ [REDIS] Updated and notified for lot ${lot_id}`)
                return { success: true, lot_id, response: response.status }
            } catch (error) {
                console.error(`❌ [REDIS] Notification failed for lot ${lot_id}:`, error.message)
                return { success: true, lot_id, notificationError: error.message }
            }
        } else {
            console.log(`✅ [REDIS] Updated lot ${lot_id} (no socket URL)`)
            return { success: true, lot_id }
        }
    } catch (err) {
        console.error(`❌ [REDIS] Error updating lot ${lot_id}:`, err.message)
        return { success: false, lot_id, error: err.message }
    }
}

/**
 * Update Redis data for all lots
 */
async function findAndUpdateTime(auctionLots, client, extend_time) {
    console.log(`🗃️ [REDIS] Starting Redis updates for ${auctionLots.length} lots`)

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

        console.log(`✅ [REDIS] Updates completed: ${successful} successful, ${failed} failed`)
        return { successful, failed, results }
    } catch (err) {
        console.error('❌ [REDIS] Error in findAndUpdateTime:', err)
        throw err
    }
}

/**
 * Batch process with controlled concurrency
 */
async function processBatchWithConcurrency(items, processor, batchSize = 10, delayBetweenBatches = 500, operationType = 'operation') {
    console.log(`📦 [BATCH] Starting ${operationType} for ${items.length} items (batch size: ${batchSize})`)
    const results = []

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        const batchNumber = Math.floor(i / batchSize) + 1
        console.log(`📦 [BATCH] Processing ${operationType} batch ${batchNumber}: items ${i + 1} to ${Math.min(i + batchSize, items.length)}`)

        const batchStart = Date.now()
        const batchPromises = batch.map(processor)
        const batchResults = await Promise.allSettled(batchPromises)
        console.log(`✅ [BATCH] Batch ${batchNumber} completed in ${Date.now() - batchStart}ms`)

        // Convert settled results
        const processedResults = batchResults.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value
            }
            const item = batch[index]
            console.error(`❌ [BATCH] Item ${i + index + 1} failed:`, result.reason?.message)
            return {
                success: false,
                lot_id: item._id || 'unknown',
                executionArn: item.executionArn || 'unknown',
                error: result.reason?.message || 'Unknown error',
                stage: 'batch_processing',
            }
        })

        results.push(...processedResults)

        // Delay between batches
        if (i + batchSize < items.length) {
            console.log(`⏳ [BATCH] Waiting ${delayBetweenBatches}ms before next batch...`)
            await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches))
        }
    }

    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length
    console.log(`🏁 [BATCH] ${operationType} completed: ${successful} successful, ${failed} failed`)

    return results
}

/**
 * PHASE 1: Stop all executions and bulk update statuses
 */
async function stopAllExecutions(lotsWithValidArns) {
    console.log('🛑 ===== PHASE 1: STOPPING ALL EXECUTIONS =====')
    const stopStart = Date.now()

    const stopResults = await processBatchWithConcurrency(
        lotsWithValidArns,
        async (lot) => await stopExecutionWithValidation(lot.executionArn),
        20, // Larger batch size for stopping
        500, // Shorter delay between batches
        'stop execution',
    )

    const stopSuccessful = stopResults.filter((r) => r.success && r.wasRunning)
    const stopFailed = stopResults.filter((r) => !r.success)

    console.log(`🛑 Phase 1 completed in ${Date.now() - stopStart}ms`)
    console.log(`📊 Stop results: ${stopSuccessful.length} successful, ${stopFailed.length} failed`)

    // ✅ BULK UPDATE DATABASE STATUSES
    if (stopSuccessful.length > 0) {
        try {
            await bulkUpdateArnStatuses(stopSuccessful)
        } catch (bulkError) {
            console.error('❌ Bulk status update failed:', bulkError)
            // Don't fail entire operation for DB update failure
        }
    }

    // Log sample failures for debugging
    if (stopFailed.length > 0) {
        console.error('❌ Sample stop failures:')
        stopFailed.slice(0, 3).forEach((failure, index) => {
            console.error(`❌ ${index + 1}:`, {
                executionArn: `${failure.executionArn?.substring(0, 50)}...`,
                error: failure.error,
                errorCode: failure.errorCode,
                stage: failure.stage,
            })
        })
    }

    return { stopResults, stopSuccessful, stopFailed }
}

/**
 * CLEANUP PHASE: Wait for AWS to clean up stopped executions
 */
async function waitForCleanup(waitTimeMs = 5000) {
    console.log(`⏳ ===== CLEANUP PHASE: Waiting ${waitTimeMs}ms for AWS cleanup =====`)
    await new Promise((resolve) => setTimeout(resolve, waitTimeMs))
    console.log('✅ Cleanup wait completed')
}

/**
 * PHASE 2: Start all new executions and bulk insert records
 */
async function startAllNewExecutions(lotsWithValidArns, stateMachineArn) {
    console.log('🚀 ===== PHASE 2: STARTING ALL NEW EXECUTIONS =====')
    const startStart = Date.now()

    const startResults = await processBatchWithConcurrency(
        lotsWithValidArns,
        async (lot) => await startExecutionForUpdate(stateMachineArn, lot),
        15, // Moderate batch size for starting
        800, // Reasonable delay for start operations
        'start execution',
    )

    const startSuccessful = startResults.filter((r) => r.success)
    const startFailed = startResults.filter((r) => !r.success)

    console.log(`🚀 Phase 2 completed in ${Date.now() - startStart}ms`)
    console.log(`📊 Start results: ${startSuccessful.length} successful, ${startFailed.length} failed`)

    // ✅ BULK INSERT NEW ARN RECORDS
    if (startSuccessful.length > 0) {
        try {
            await bulkInsertNewArnRecords(startSuccessful)
        } catch (bulkError) {
            console.error('❌ Bulk insert failed:', bulkError)
            // Don't fail entire operation for DB insert failure
        }
    }

    // Log sample failures for debugging
    if (startFailed.length > 0) {
        console.error('❌ Sample start failures:')
        startFailed.slice(0, 3).forEach((failure, index) => {
            console.error(`❌ ${index + 1}:`, {
                lot_id: failure.lot_id,
                error: failure.error,
                errorCode: failure.errorCode,
                stage: failure.stage,
            })
        })
    }

    return { startResults, startSuccessful, startFailed }
}

/**
 * Main optimized update handler with bulk operations and ended lots handling
 */
module.exports.updateHandler = async (event, context) => {
    const startTime = Date.now()
    const timeoutBuffer = 60000
    const timeoutTime = Date.now() + (context.getRemainingTimeInMillis() - timeoutBuffer)

    console.log('🎯 ===== OPTIMIZED UPDATE HANDLER STARTED =====')
    console.log('📋 Event:', JSON.stringify(event, null, 2))
    console.log('⏱️ Remaining time:', context.getRemainingTimeInMillis())

    try {
        // MongoDB connection
        if (connection === null || !connection.readyState) {
            console.log('🔌 Connecting to MongoDB...')
            connection = await mongodbHelper.connect()
            console.log('✅ MongoDB connected')
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

        console.log(`📊 Processing ${auctionLots.length} lots`)

        // Redis setup
        const client = await redisHelper.createRedisClient()
        const extend_time = parseInt(auctionDetails.extension_time.replace('m', ''), 10) * 60 * 1000

        // Step 1: Update Redis
        console.log('🗃️ ===== STEP 1: UPDATING REDIS DATA =====')
        const redisResults = await findAndUpdateTime(auctionLots, client, extend_time)

        // Step 2: Filter active and ended lots
        const activeLots = auctionLots.filter((item) => {
            item.lot_end_time = item.end_date + extend_time
            return item.end_date > currentTimeEpoch
        })

        const endedLots = auctionLots.filter((item) => {
            item.lot_end_time = item.end_date + extend_time
            return item.end_date <= currentTimeEpoch
        })

        console.log(`📊 Found ${activeLots.length} active lots and ${endedLots.length} ended lots`)

        // Handle ended lots (run in parallel with active lot processing)
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

        // Step 3: Get execution ARNs for active lots
        console.log('🔍 ===== STEP 2: RETRIEVING EXECUTION ARNS =====')
        const lotsWithArns = await processBatchWithConcurrency(
            activeLots,
            async (item) => {
                try {
                    const getAllArns = await mongodbHelper.singleGetAllExecutionArn(item, StepFunctionArn)
                    if (getAllArns && getAllArns.arn) {
                        return {
                            ...item,
                            executionArn: getAllArns.arn,
                            arnRecord: getAllArns,
                        }
                    }
                    return {
                        ...item,
                        executionArn: null,
                        error: 'No ARN found',
                    }
                } catch (error) {
                    return {
                        ...item,
                        executionArn: null,
                        error: error.message,
                    }
                }
            },
            20,
            300,
            'ARN retrieval',
        )

        const lotsWithValidArns = lotsWithArns.filter((lot) => lot.executionArn)
        const lotsWithoutArns = lotsWithArns.filter((lot) => !lot.executionArn)

        console.log(`📊 ARN Results: ${lotsWithValidArns.length} with ARNs, ${lotsWithoutArns.length} without ARNs`)

        if (lotsWithValidArns.length === 0) {
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

        // PHASE 1: Stop all executions with bulk updates
        const { stopResults, stopSuccessful, stopFailed } = await stopAllExecutions(lotsWithValidArns)

        // CLEANUP PHASE: Wait for AWS cleanup
        await waitForCleanup(5000)

        // PHASE 2: Start all new executions with bulk inserts
        const { startResults, startSuccessful, startFailed } = await startAllNewExecutions(
            lotsWithValidArns,
            process.env.STATE_MACHINE_LOT_ARN,
        )

        // Final results
        const totalTime = Date.now() - startTime
        const response = {
            success: stopFailed.length === 0 && startFailed.length === 0,
            approach: 'bulk_operations_with_ended_lots_handling',
            summary: {
                total_lots: auctionLots.length,
                active_lots: activeLots.length,
                ended_lots: endedLots.length,
                ended_lots_processed: endedLotsResult,
                lots_with_arns: lotsWithValidArns.length,
                lots_without_arns: lotsWithoutArns.length,
                stop_successful: stopSuccessful.length,
                stop_failed: stopFailed.length,
                start_successful: startSuccessful.length,
                start_failed: startFailed.length,
                execution_time_ms: totalTime,
                redis_results: redisResults,
            },
            phases: {
                stop_phase: {
                    successful: stopSuccessful.length,
                    failed: stopFailed.length,
                    sample_failures: stopFailed.slice(0, 3).map((f) => ({
                        error: f.error,
                        errorCode: f.errorCode,
                        stage: f.stage,
                    })),
                },
                start_phase: {
                    successful: startSuccessful.length,
                    failed: startFailed.length,
                    sample_failures: startFailed.slice(0, 3).map((f) => ({
                        lot_id: f.lot_id,
                        error: f.error,
                        errorCode: f.errorCode,
                        stage: f.stage,
                    })),
                },
                ended_lots_phase: endedLotsResult,
            },
            timestamp: new Date().toISOString(),
        }

        console.log('🎯 ===== UPDATE HANDLER COMPLETED =====')
        console.log('📊 Final summary:', response.summary)

        return response
    } catch (error) {
        console.error('💥 ===== UPDATE HANDLER ERROR =====')
        console.error('❌ Error details:', {
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
