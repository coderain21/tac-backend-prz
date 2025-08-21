/* eslint-disable no-continue */
/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const AWS = require('aws-sdk')
const fs = require('fs')
const path = require('path')
const mongoConnection = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const Counter = require('../entities/Counter')
const helpers = require('../lib/helper')

let connection = null

/**
 * Cleans HTML tags and escapes CSV special characters
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
function cleanTextForCSV(text) {
    if (!text) return ''

    return text
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/,/g, ';') // Replace commas with semicolons
        .replace(/"/g, '""') // Escape quotes
        .replace(/\r?\n/g, ' ') // Replace line breaks with spaces
        .trim()
}

/**
 * Escapes text for CSV format
 * @param {string} text - Text to escape
 * @returns {string} Escaped text wrapped in quotes
 */
function escapeCSVField(text) {
    if (!text) return ''
    return `"${cleanTextForCSV(text)}"`
}

/**
 * Exports lots data to CSV and uploads to S3
 * @param {Object} auctionData - Auction information
 * @param {Array} lots - Array of lot objects
 * @returns {string|null} Signed S3 URL or null if error
 */
async function exportLotsAsCSV(auctionData, lots) {
    let tempFilePath = null

    try {
        const fileName = process.env.CSV_FILE || `lots_export_${Date.now()}.csv`
        tempFilePath = path.join('/tmp', fileName) // Use /tmp directory for Lambda
        const s3Key = `exports/lots/${fileName}`
        const s3Bucket = process.env.S3_BUCKET

        if (!s3Bucket) {
            throw new Error('S3_BUCKET environment variable is not set')
        }

        console.log('Exporting to temp file:', tempFilePath)
        console.log('S3 Bucket:', s3Bucket)

        // CSV Headers
        const csvHeaders = [
            'Lot Number',
            'Title 1',
            'Title 2',
            'Reserve',
            'Start Time',
            'Number of Images',
            'Absentee Bids',
            'Telephone Bids',
        ]

        let csvContent = `${csvHeaders.join(',')}\n`

        // Process each lot
        // eslint-disable-next-line no-restricted-syntax
        for (const lot of lots) {
            try {
                const startTime = lot.start_time
                    ? new Date(lot.start_time).toISOString()
                    : ''

                const csvRow = [
                    lot.lot_number || '',
                    escapeCSVField(lot.title1),
                    escapeCSVField(lot.title2),
                    lot.reserve || '',
                    startTime,
                    Array.isArray(lot.images) ? lot.images.length : 0,
                    lot.number_of_absentee_bids || 0,
                    lot.number_of_telephone_bids || 0,
                ]

                csvContent += `${csvRow.join(',')}\n`
            } catch (err) {
                console.error(`Error processing lot ${lot.lot_number}:`, err)
                continue
            }
        }

        // Write CSV file to /tmp directory
        fs.writeFileSync(tempFilePath, csvContent, 'utf8')

        // Upload to S3
        const s3Client = new AWS.S3({ region: process.env.AWS_REGION || 'eu-west-2' })

        const uploadResult = await s3Client.upload({
            Bucket: s3Bucket,
            Key: s3Key,
            Body: fs.createReadStream(tempFilePath),
            ContentType: 'text/csv',
            ServerSideEncryption: 'AES256',
            Metadata: {
                'auction-id': auctionData.auction_id || '',
                'generated-at': new Date().toISOString(),
            },
        }).promise()

        console.log('Upload successful:', uploadResult.Location)

        // Generate signed URL
        const signedUrl = s3Client.getSignedUrl('getObject', {
            Bucket: s3Bucket,
            Key: s3Key,
            Expires: 3600, // URL expiration time in seconds
        })

        return signedUrl
    } catch (err) {
        console.error('Export error:', err)
        return null
    } finally {
        // Clean up temp file
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath)
                console.log('Temp file cleaned up:', tempFilePath)
            } catch (cleanupErr) {
                console.error('Error cleaning up temp file:', cleanupErr)
            }
        }
    }
}

/**
 * Alternative approach: Export directly to S3 without temporary file
 * @param {Object} auctionData - Auction information
 * @param {Array} lots - Array of lot objects
 * @returns {string|null} Signed S3 URL or null if error
 */
async function exportLotsAsCSVDirect(auctionData, lots) {
    try {
        const fileName = process.env.CSV_FILE || `${auctionData.auction_id}_lots.csv`
        const s3Key = `exports/lots/${fileName}`
        const s3Bucket = process.env.S3_BUCKET

        if (!s3Bucket) {
            throw new Error('S3_BUCKET environment variable is not set')
        }

        console.log('Direct S3 upload for file:', fileName)

        // CSV Headers
        const csvHeaders = [
            'Lot Number',
            'Title 1',
            'Title 2',
            'Reserve',
            'Start Time',
            'Number of Images',
            'Absentee Bids',
            'Telephone Bids',
        ]

        let csvContent = `${csvHeaders.join(',')}\n`

        // Process each lot
        // eslint-disable-next-line no-restricted-syntax
        for (const lot of lots) {
            try {
                const startTime = lot.start_time
                    ? new Date(lot.start_time).toISOString()
                    : ''

                const csvRow = [
                    lot.lot_number || '',
                    escapeCSVField(lot.title1),
                    escapeCSVField(lot.title2),
                    lot.reserve || '',
                    startTime,
                    Array.isArray(lot.images) ? lot.images.length : 0,
                    lot.number_of_absentee_bids || 0,
                    lot.number_of_telephone_bids || 0,
                ]

                csvContent += `${csvRow.join(',')}\n`
            } catch (err) {
                console.error(`Error processing lot ${lot.lot_number}:`, err)
                continue
            }
        }

        // Upload directly to S3 using Buffer
        const s3Client = new AWS.S3({ region: process.env.AWS_REGION || 'eu-west-2' })

        const uploadResult = await s3Client.upload({
            Bucket: s3Bucket,
            Key: s3Key,
            Body: Buffer.from(csvContent, 'utf8'),
            ContentType: 'text/csv',
            ServerSideEncryption: 'AES256',
            Metadata: {
                'auction-id': auctionData.auction_id || '',
                'generated-at': new Date().toISOString(),
            },
        }).promise()

        console.log('Direct upload successful:', uploadResult.Location)

        // Generate signed URL
        const signedUrl = s3Client.getSignedUrl('getObject', {
            Bucket: s3Bucket,
            Key: s3Key,
            Expires: 3600,
        })

        return signedUrl
    } catch (err) {
        console.error('Direct export error:', err)
        return null
    }
}

/**
 * Validates and sanitizes query parameters
 * @param {Object} params - Query string parameters
 * @returns {Object} Validated parameters
 */
function validateQueryParams(params) {
    const validSortFields = ['reserve', 'lot_number', 'title1', 'number_of_absentee_bids', 'number_of_telephone_bids']
    const validSortOrders = ['ascending', 'descending']

    return {
        auctionId: params?.auction_id,
        sortBy: validSortFields.includes(params?.sort_by) ? params.sort_by : 'lot_number',
        sortOrder: validSortOrders.includes(params?.sort_order) ? params.sort_order : 'ascending',
        searchKeyword: params?.search_keyword?.trim(),
        page: Math.max(1, parseInt(params?.page, 10) || 1),
        perPage: Math.min(100, Math.max(1, parseInt(params?.per_page, 10) || 10)),
        exportAsCsv: params?.export === 'true' || params?.export === '1',
    }
}

/**
 * Checks user authorization
 * @param {Object} event - Lambda event object
 * @returns {string} User email from claims
 * @throws {Error} If unauthorized
 */
function checkAuthorization(event) {
    const { claims } = event.requestContext?.authorizer || {}

    if (!claims || !claims['cognito:username']) {
        throw new Error('Unauthorized')
    }

    return claims['cognito:username']
}

/**
 * Main Lambda handler for listing lots
 */
module.exports.list_lot = async (event) => {
    try {
        // Authorization check
        const sellerEmail = checkAuthorization(event)

        // Database connection
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        // Validate query parameters
        const {
            auctionId,
            sortBy,
            sortOrder,
            searchKeyword,
            page,
            perPage,
            exportAsCsv,
        } = validateQueryParams(event.queryStringParameters)

        if (!auctionId) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Please provide auction ID' }),
            }
        }

        // Verify auction exists and belongs to seller
        const auctionQuery = { auction_id: auctionId, seller_email: sellerEmail }
        const auctionData = await Auction.findOne(auctionQuery)

        if (!auctionData) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        // Build sort criteria
        const sortCriteria = {
            [sortBy]: sortOrder === 'ascending' ? 1 : -1,
        }

        // Build search criteria
        const searchCriteria = searchKeyword ? {
            $or: [
                { title1: { $regex: searchKeyword, $options: 'i' } },
                { title2: { $regex: searchKeyword, $options: 'i' } },
            ],
        } : {}

        // Define projection for lot fields
        const projection = {
            _id: 1,
            lot_number: 1,
            title1: 1,
            title2: 1,
            reserve: 1,
            start_time: 1,
            images: 1,
            number_of_absentee_bids: 1,
            number_of_telephone_bids: 1,
        }

        // Final query combining auction, search criteria
        const finalQuery = { ...auctionQuery, ...searchCriteria }

        // Execute queries
        const [lots, totalCount] = await Promise.all([
            Lot.find(finalQuery)
                // .select(projection)
                .sort(sortCriteria)
                .limit(perPage)
                .skip((page - 1) * perPage),
            Lot.countDocuments(finalQuery),
        ])

        // Build response
        const response = {
            data: lots,
            total_records_found: totalCount,
            total_pages: Math.ceil(totalCount / perPage),
            current_page: page,
        }

        // Handle CSV export
        if (exportAsCsv) {
            // Use direct upload method (recommended) or temp file method
            const signedUrl = await exportLotsAsCSVDirect(auctionData, lots)
            // Alternative: const signedUrl = await exportLotsAsCSV(auctionData, lots)

            if (signedUrl) {
                response.csv_url = signedUrl
            } else {
                response.csv_error = 'Failed to generate CSV export'
            }
        }

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify(response),
        }
    } catch (error) {
        console.error('Error in list_lot:', error)

        // Handle authorization errors
        if (error.message === 'Unauthorized') {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

        // Handle other errors
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            }),

        }
    }
}
