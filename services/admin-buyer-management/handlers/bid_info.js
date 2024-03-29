/* eslint-disable no-self-assign */
/* eslint-disable consistent-return */
/* eslint-disable no-use-before-define */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */

const AWS = require('aws-sdk')
// const { ObjectId } = require('mongodb')
const fs = require('fs')
const createCsvWriter = require('csv-writer').createObjectCsvWriter
const { ObjectId } = require('mongodb')
const helpers = require('../lib/helper')
const BidInformation = require('../entities/BidInformation')
const Lot = require('../entities/Lot')
const Bid = require('../entities/Bid')
const helper = require('../utilities/helper')
const mongodbHelper = require('../lib/mongodb_helper')

mongodbHelper.connect()

const timeZoneMap = {
    'UTC - Coordinated Universal Time': 'Etc/UTC',
    'GMT - Greenwich Mean Time': 'Etc/GMT',
    'BST - British Summer Time': 'Europe/London',
    'CET - Central European Time': 'Europe/Paris',
    'IST - India Standard Time': 'Asia/Kolkata',
    'CST - China Standard Time': 'Asia/Shanghai',
    'JST - Japan Standard Time': 'Asia/Tokyo',
    'AEST - Australian Eastern Standard Time': 'Australia/Sydney',
    'NZST - New Zealand Standard Time': 'Pacific/Auckland',
    'PST - Pacific Standard Time(US)': 'America/Los_Angeles',
    'MST - Mountain Standard Time (US)': 'America/Denver',
    'CST - Central Standard Time (US)': 'America/Chicago',
    'EST - Eastern Standard Time (US)': 'America/New_York',
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

const formatDate = (timestamp, timeZone) => {
    const date = new Date(timestamp) // Convert timestamp to Date
    // Format options for date and time
    const options = {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
        hour12: false, // Force 24-hour format
        timeZone: timeZoneMap[timeZone],
    }

    // Format the date using toLocaleString
    let formatted = date.toLocaleString('en-GB', options)
    if (formatted.includes('GMT+5:30')) {
        formatted = formatted.replace('GMT+5:30', 'IST')
    } else if (formatted.includes('GMT+11')) {
        formatted = formatted.replace('GMT+11', 'AESR')
    } else if (formatted.includes('GMT+13')) {
        formatted = formatted.replace('GMT+13', 'NZST')
    } else if (formatted.includes('GMT+1')) {
        formatted = formatted.replace('GMT+1', 'CET')
    } else if (formatted.includes('GMT+9')) {
        formatted = formatted.replace('GMT+9', 'JST')
    } else if (formatted.includes('GMT+8')) {
        formatted = formatted.replace('GMT+8', 'CST')
    }

    return formatted.replace(',', ' /')
}

async function exportAsCsv(bidders) {
    try {
        const filename = 'Bidding Information'

        const tempDir = '/tmp'
        const csvFilePath = `${tempDir}/${filename}.csv`

        const s3Key = `admin/exports/bidders/${filename}.csv`
        const s3Bucket = process.env.BUCKET_NAME

        const csvWriter = createCsvWriter({
            path: csvFilePath,
            header: [
                { id: 'Paddle Number', title: 'Paddle Number' },
                { id: 'Bidder Name', title: 'Bidder Name' },
                { id: 'Amount', title: 'Amount' },
                { id: 'Bid Date', title: 'Bid Date' },
            ],
        })

        const records = []

        for (const bidder of bidders) {
            bidder.updated_at = new Date(bidder.updated_at)
            const formattedDate = formatDate(bidder.updated_at, bidder.time_zone)
            const currencySymbol = currencySymbolMapping[bidder.currency]
            // Append currency symbol to the bid amount
            const amountWithSymbol = `${currencySymbol}${bidder.bid_amount}`

            records.push({
                'Paddle Number': bidder.paddle_number || '',
                'Bidder Name': bidder.name, // `${bidder.first_name || ''} ${bidder.last_name || ''}`.trim(),
                Amount: amountWithSymbol,
                'Bid Date': formattedDate,
            })
        }

        await csvWriter.writeRecords(records)

        const s3 = new AWS.S3({ region: 'eu-west-2' })
        const params = {
            Bucket: s3Bucket,
            Key: s3Key,
            Body: fs.createReadStream(csvFilePath),
        }

        await s3.upload(params).promise()

        await s3.putObjectAcl({
            Bucket: s3Bucket,
            Key: s3Key,
            ACL: 'public-read',
        }).promise()

        const s3SignedUrl = s3.getSignedUrl('getObject', {
            Bucket: s3Bucket,
            Key: s3Key,
            Expires: 3600,
        })

        return s3SignedUrl
    } catch (err) {
        console.error('Error:', err)
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

module.exports.handler = async (event) => {
    try {
        const lotId = decodeURIComponent(event.queryStringParameters.lot_id)
        const query = {
            _id: new ObjectId(lotId),
        }
        const getLot = await mongodbHelper.view(Lot, query)
        const queryCount = {
            lot_id: lotId,
        }
        const getBiddderCount = await mongodbHelper.view(Bid, queryCount)

        const { queryStringParameters: queryParams } = event

        const mongoose_query = {
            $and: [{ lot_id: lotId }],
        }

        let theSort = {
            paddle_number: -1,
        }

        if (queryParams?.sort_by && queryParams?.sort_order) {
            const sort = {}
            sort[queryParams.sort_by] = queryParams.sort_order
            theSort = sort
        }

        const options = {
            sort: theSort,
        }

        options.projection = {
            paddle_number: 1,
            name: 1,
            bid_amount: 1,
            time_stamp: 1,
            created_at: 1,
            updated_at: 1,
            time_zone: 1,
        }

        let bidsList = null
        if (queryParams.export === 'true') {
            try {
                if (options.sort) {
                    // Fetch all documents with sorting
                    bidsList = await BidInformation.find(mongoose_query).sort(options.sort)
                } else {
                    // Fetch all documents without sorting
                    bidsList = await BidInformation.find(mongoose_query)
                }
                if (bidsList === null) {
                    console.error('Error: No documents found.')
                    // Handle the case where no documents are found
                    return // or throw an error, depending on your requirement
                }
                return {
                    statusCode: 200,
                    headers: helpers.getHeaders(),
                    body: JSON.stringify({
                        download_link: await exportAsCsv(bidsList),
                    }),
                }
                // Further processing or returning the result
            } catch (error) {
                console.error('Error occurred while fetching documents:', error)
                // Handle the error accordingly
            }
        } else {
            const page = parseInt(queryParams?.page, 10) || 1
            const limit = queryParams?.limit ? parseInt(queryParams.limit, 10) : 10
            options.page = page
            options.limit = limit

            bidsList = await mongodbHelper.list(BidInformation, mongoose_query, options)
        }

        if (bidsList.docs.length <= 0) {
            return {
                statusCode: 404,
                headers: helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Bids not found',
                }),
            }
        }

        const getLowestBidder = await helper.getLowestBidder(lotId, Bid)

        let underBidder = {}
        if (getLowestBidder.length > 1) {
            underBidder = {
                name: getLowestBidder[1].name,
                id: new ObjectId(getLowestBidder[1]._id),
                bid_amount: getLowestBidder[1].bid_amount,
            }
        }

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                data: bidsList.docs,
                pagination: {
                    total_pages: queryParams?.export === 'true' ? 1 : bidsList.totalPages,
                    limit: bidsList.docs.length,
                    total_records: bidsList.totalDocs,
                    next_page: null,
                    page: queryParams?.export === 'true' ? 1 : bidsList.page,
                    top_bid: getLot.length > 0 ? getLot[0].current_bid : 0,
                    bidders: getBiddderCount.length > 0 ? getBiddderCount.length : 0,
                    top_bidder: getLot.length > 0 ? getLot[0].top_bidder : '',
                    under_bidder: underBidder,
                },
            }),
        }
    } catch (error) {
        console.error(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'There was an error while listing bids',
            }),
        }
    }
}
