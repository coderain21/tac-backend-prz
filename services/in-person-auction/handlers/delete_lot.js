/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const { ObjectId } = require('mongodb')
const AWS = require('aws-sdk')
const helpers = require('../lib/helper')
const mongoConnection = require('../lib/mongodb_helper')
const Lot = require('../entities/Lot')
const Counter = require('../entities/Counter')
const Auction = require('../entities/Auction')

let connection = null

/**
 * Extract S3 key from image object
 * @param {Object} imageObj - The image object with url and featured properties
 * @returns {string|null} - The validated S3 key or null if invalid
 */
function extractS3KeyFromImage(imageObj) {
    if (!imageObj || typeof imageObj !== 'object' || !imageObj.url) {
        return null
    }

    const { url } = imageObj
    if (typeof url !== 'string' || url.trim() === '') {
        return null
    }

    return url.trim()
}

/**
 * Delete images from S3
 * @param {Array} images - Array of image objects with url and featured properties
 * @returns {Promise<boolean>} - Success status
 */
async function deleteImagesFromS3(images) {
    if (!images || !Array.isArray(images) || images.length === 0) {
        return true // No images to delete
    }

    try {
        const s3Client = new AWS.S3({
            region: process.env.AWS_REGION || 'eu-west-2',
        })

        const bucketName = process.env.S3_BUCKET

        // Extract S3 keys from image objects
        const s3Keys = images
            .map(extractS3KeyFromImage)
            .filter((key) => key !== null)

        if (s3Keys.length === 0) {
            console.log('No valid S3 keys found in images array')
            return true
        }

        // Delete objects from S3
        const deletePromises = s3Keys.map(async (key) => {
            try {
                await s3Client.deleteObject({
                    Bucket: bucketName,
                    Key: `public/${key}`,
                }).promise()
                console.log(`Successfully deleted S3 object: ${key}`)
                return true
            } catch (error) {
                console.error(`Failed to delete S3 object ${key}:`, error)
                return false
            }
        })

        const results = await Promise.all(deletePromises)
        const successCount = results.filter((result) => result === true).length

        console.log(`Deleted ${successCount}/${s3Keys.length} images from S3`)
        return successCount === s3Keys.length
    } catch (error) {
        console.error('Error deleting images from S3:', error)
        return false
    }
}

async function updateLotNumbers(auctionId, sellerEmail, deletedLotNumber) {
    /**
   * Updates lot numbers after a lot is deleted to maintain sequential ordering
   */
    try {
        // Find all lots with lot_number greater than deleted lot
        const lotsToUpdate = await Lot.find({
            auction_id: auctionId,
            seller_email: sellerEmail,
            lot_number: { $gt: deletedLotNumber },
        }).sort({ lot_number: 1 })

        // Prepare bulk operations
        if (!lotsToUpdate || lotsToUpdate.length === 0) {
            return true
        }

        const bulkOps = lotsToUpdate.map((lot) => ({
            updateOne: {
                filter: { _id: new ObjectId(lot._id) },
                update: { $set: { lot_number: lot.lot_number - 1 } },
            },
        }))

        // Execute bulk write if there are updates
        if (bulkOps.length > 0) {
            await Lot.bulkWrite(bulkOps)
            return true
        }

        return false
    } catch (err) {
        console.error(`Error updating lot numbers: ${err.message}`)
        return false
    }
}

module.exports.delete_lot = async (event) => {
    try {
        // --- Authorization Check ---
        const { claims } = event.requestContext?.authorizer || {}
        if (!claims || !claims['cognito:username']) {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }
        // --- Ensure MongoDB connection ---
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const { lot_id, auction_id } = JSON.parse(event.body) || {}

        // --- Validate request body ---
        if (!lot_id || !auction_id) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Lot ID and auction ID is required' }),
            }
        }

        // Get seller email from Cognito claims
        const email = event.requestContext.authorizer.claims['cognito:username']
        const auctionDetails = await Auction.findOne({ auction_id, seller_email: email })

        // --- Validate auction and state ---
        if (!auctionDetails) {
            return {
                statusCode: 404,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }
        if (auctionDetails.status !== 'Draft') {
            return {
                statusCode: 400,
                headers: helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not in draft state' }),
            }
        }

        // --- Find the lot first to get image data ---
        const lot = await Lot.findOne({ _id: new ObjectId(lot_id) })

        if (!lot) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Lot not found' }),
            }
        }

        // --- Delete images from S3 before deleting the lot ---
        if (lot.images && lot.images.length > 0) {
            console.log(`Deleting ${lot.images.length} images from S3 for lot ${lot_id}`)
            const s3DeleteSuccess = await deleteImagesFromS3(lot.images)

            if (!s3DeleteSuccess) {
                console.warn('Some images failed to delete from S3, but continuing with lot deletion')
            }
        }

        // --- Delete the lot from database ---
        await Lot.findOneAndDelete({ _id: new ObjectId(lot_id) })

        // --- Update lot counter (decrement sequence) ---
        await Counter.findOneAndUpdate({
            seller_email: email, auction_id, record_type: 'Lots',
        }, { $inc: { starting_sequence: -1 } })

        // --- Reorder remaining lots sequentially ---
        if (!(await updateLotNumbers(auction_id, email, lot.lot_number))) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Error updating lot numbers' }),
            }
        }

        // Return 204 No Content on successful deletion
        return {
            statusCode: 204,
            headers: await helpers.getHeaders(),
        }
    } catch (error) {
        console.log('Internal Server Error', error)
        return {
            headers: await helpers.getHeaders(),
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
