/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
const AWS = require('aws-sdk')
const helpers = require('../lib/helper')
const liveBids = require('../entities/LiveBid')
const Auction = require('../entities/Auction')
// const helper = require('../utilities/helper')
const mongodbHelper = require('../lib/mongodb_helper')

let connection

function validateQueryParams(params) {
    const validSortFields = ['reserve', 'lot_number', 'paddle_number', 'bid_amount', 'name', 'title1']
    const validSortOrders = ['ascending', 'descending']

    // console.log('params', params)

    return {
        auctionId: params?.auction_id,
        bidType: params?.bid_type,
        sortBy: validSortFields.includes(params?.sort_by) ? params.sort_by : 'lot_number',
        sortOrder: validSortOrders.includes(params?.sort_order) ? params.sort_order : 'ascending',
        searchKeyword: params?.search_keyword?.trim(),
        page: Math.max(1, parseInt(params?.page, 10) || 1),
        perPage: Math.min(100, Math.max(1, parseInt(params?.per_page, 10) || 10)),
        exportAsCsv: params?.export === 'true' || params?.export === 'True' || params?.export === '1', // Fixed case sensitivity
    }
}

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

const currencySymbolMapping = {
    GBP: '£',
    USD: '$',
    EUR: '€',
    HKD: 'HK$',
    JPY: '¥',
    CHF: 'Fr',
    SGD: 'S$',
    AUD: 'A$',
    CAD: 'C$',
    INR: '₹',
}

/**
 * Export bidders data to CSV and upload to S3
 * @param {Object} auctionData - Auction information
 * @param {Array} bids - Array of bid objects from the list_bids query
 * @param {string} bidType - Type of bids ('absentee' or 'telephone')
 * @returns {string|null} Signed S3 URL or null if error
 */
async function exportBidsAsCSVDirect(auctionData, bids, bidType) {
    try {
        const fileName = process.env.CSV_FILE || `${auctionData.auction_id}_${bidType}_bids.csv`
        const s3Key = `exports/bids/${fileName}`
        const s3Bucket = process.env.S3_BUCKET

        if (!s3Bucket) {
            throw new Error('S3_BUCKET environment variable is not set')
        }

        console.log('Direct S3 upload for file:', fileName)

        // Use the currency symbol mapping to get the correct symbol
        const currencySymbol = currencySymbolMapping[auctionData.currency] || auctionData.currency || '$'

        let csvHeaders = []
        // CSV Headers matching the bid data structure
        if (bidType === 'absentee') {
            csvHeaders = [
                'Lot Number',
                'Lot Title',
                'Paddle Number',
                'Bidder Name',
                'Reserve',
                'Bid Amount',
            ]
        } else {
            csvHeaders = [
                'Lot Number',
                'Lot Title',
                'Paddle Number',
                'Bidder Name',
                'Phone Number',
                'Country Code',
                'Reserve',
                'Bid Amount',
            ]
        }

        let csvContent = `${csvHeaders.join(',')}\n`

        // Process each bid
        // eslint-disable-next-line no-restricted-syntax
        for (const bid of bids) {
            try {
                let csvRow = []

                if (bidType === 'absentee') {
                    // For absentee bids - no phone number fields
                    csvRow = [
                        bid.lot_number || '',
                        escapeCSVField(bid.lot_title),
                        bid.paddle_number || '',
                        escapeCSVField(bid.name),
                        bid.reserve ? `${currencySymbol}${bid.reserve}` : '',
                        bid.bid_amount ? `${currencySymbol}${bid.bid_amount}` : '',
                    ]
                } else {
                    // For telephone bids - include phone number fields
                    // Country code already has + prefix from the data
                    const countryCode = bid.country_code || ''

                    csvRow = [
                        bid.lot_number || '',
                        escapeCSVField(bid.lot_title),
                        bid.paddle_number || '',
                        escapeCSVField(bid.name),
                        bid.phone_number || '',
                        countryCode,
                        bid.reserve ? `${currencySymbol}${bid.reserve}` : '',
                        bid.bid_amount ? `${currencySymbol}${bid.bid_amount}` : '',
                    ]
                }

                csvContent += `${csvRow.join(',')}\n`
            } catch (err) {
                console.error(`Error processing bid for lot ${bid.lot_number}:`, err)
                // eslint-disable-next-line no-continue
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
                'bid-type': bidType,
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
 * List Bidders | Seller Lot List
 * @description - API to list all bidders
 * @route - GET /{lot_id}
 * @access - (Private)
 * @user - IndyAuction Seller
 * @returns {Object} (200) - List of bidders
 * @returns {Error} (500) - There was an error while listing bidders
 */
module.exports.list_bids = async (event) => {
    try {
        // --- Authorization Check ---
        try {
            const { claims } = event.requestContext.authorizer
            if (!claims || !claims['cognito:username']) {
                throw new Error('Unauthorized')
            }
            // You can add group checks here if needed
        } catch (error) {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }
        // --- End Authorization Check ---

        const email = event.requestContext.authorizer.claims['cognito:username']
        const sellerEmail = email

        /** Establish database connection */
        connection = await mongodbHelper.connect()

        const {
            auctionId,
            bidType,
            sortBy,
            sortOrder,
            searchKeyword,
            page,
            perPage,
            exportAsCsv,
        } = validateQueryParams(event.queryStringParameters)

        if (bidType !== 'absentee' && bidType !== 'telephone') {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Please provide valid bid_type' }),
            }
        }

        // console.log('queryStringParameters', event.queryStringParameters)
        // console.log('auctionId', auctionId)
        // console.log('sortBy', sortBy)
        // console.log('sortOrder', sortOrder)
        // console.log('searchKeyword', searchKeyword)
        // console.log('page', page)
        // console.log('perPage', perPage)
        // console.log('exportAsCsv', exportAsCsv)

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
                { lot_title: { $regex: searchKeyword, $options: 'i' } },
            ],
        } : {}

        const finalQuery = {
            ...searchCriteria,
            auction_id: auctionId,
            seller_email: sellerEmail,
            bid_type: bidType,
        }

        // console.log('finalQuery', finalQuery)

        const projection = {
            _id: 1,
            lot_number: 1,
            lot_image: 1,
            paddle_number: 1,
            phone_number: 1,
            country_code: 1,
            name: 1,
            lot_title: 1,
            reserve: 1,
            bid_amount: 1,
            created_at: 1,
        }

        let lots = []
        let totalCount = 0
        const response = {}

        if (exportAsCsv) {
            // fetch ALL bids for CSV export
            lots = await liveBids.find(finalQuery)
                .select(projection)
                .sort(sortCriteria)
                .lean()
            totalCount = lots.length

            const signedUrl = await exportBidsAsCSVDirect(auctionData, lots, bidType)
            if (signedUrl) {
                response.csv_url = signedUrl
            } else {
                response.csv_error = 'Failed to generate CSV export'
            }
        } else {
            // fetch paginated bids + total count in parallel
            const [bidsDocs, count] = await Promise.all([
                liveBids.find(finalQuery)
                    .select(projection)
                    .sort(sortCriteria)
                    .limit(perPage)
                    .skip((page - 1) * perPage)
                    .lean(),
                liveBids.countDocuments(finalQuery),
            ])
            lots = bidsDocs
            totalCount = count
        }

        // Build response
        response.data = lots
        response.total_records_found = totalCount
        response.total_pages = Math.ceil(totalCount / perPage)
        response.current_page = page

        /** Return successful response with enterprise data and pagination info */
        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify(response),
        }
    } catch (error) {
        /** Log and handle errors */
        console.error(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'There was an error while listing bids',
            }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
