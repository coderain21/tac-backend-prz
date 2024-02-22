/* eslint-disable object-shorthand */
/* eslint-disable eqeqeq */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */

// const fs = require('fs')
// const createCsvWriter = require('csv-writer')
const AWS = require('aws-sdk')
// const { ObjectId } = require('mongodb')
const fs = require('fs')
const createCsvWriter = require('csv-writer').createObjectCsvWriter
const helpers = require('../lib/helper')
const RegisteredUser = require('../entities/RegisteredUser')
const mongodbHelper = require('../lib/mongodb_helper')

let connection
/**
 * List Bidders | Admin Buyers list
 * @description - API to list all buyers
 * @route - GET /{auction_id}/{seller_email}
 * @access - (Private)
 * @user - IndyAuction Admin
 * @returns {Object} (200) - List of buyers
 * @returns {Error} (500) - There was an error while listing buyers
 */

// Convert date to desired format
function formatDate(date) {
    const options = { day: '2-digit', month: 'short', year: 'numeric' }
    return date.toLocaleDateString('en-US', options)
}

async function exportAsCsv(bidders) {
    try {
        const auctionId = String(bidders[0]?.auction_id || '')
        // console.log('auctionId', auctionId)
        // const auctionCollection = db.collection(process.env.AUCTION_MONGODB_COLLECTION_NAME)
        // const auctionDetails = await mongodbHelper.getAuction(auctionId, process.env.AUCTION_MONGODB_COLLECTION_NAME)
        // console.log('auctionDetails', auctionDetails)
        const filename = 'Bidder List'
        console.log('filename', filename)

        // Use a temporary directory
        const tempDir = '/tmp' // Use the Lambda /tmp directory
        const csvFilePath = `${tempDir}/${filename}.csv`
        console.log('CSV file path:', csvFilePath)

        const s3Key = `admin/exports/bidders/${auctionId}/${filename}.csv`
        const s3Bucket = process.env.BUCKET_NAME

        // console.log('Bidders details------------', bidders)

        const csvWriter = createCsvWriter({
            path: csvFilePath,
            header: [
                { id: 'Paddle Number', title: 'Paddle Number' },
                { id: 'Name', title: 'Name' },
                { id: 'Email', title: 'Email' },
                { id: 'Date Registered', title: 'Date Registered' },
                { id: 'Marketing Communication', title: 'Marketing Communication' },
                { id: 'Bidder Status', title: 'Bidder Status' },
            ],
        })

        const records = []

        // eslint-disable-next-line no-restricted-syntax
        for (const bidder of bidders) {
            // eslint-disable-next-line no-unused-vars
            const dateRegistered = bidder.created_at instanceof Date ? bidder.created_at : ''
            // const formattedDate = dateRegistered ? dateRegistered.toISOString().split('T')[0] : ''
            const formattedDate = formatDate(bidder.created_at)
            let marketing // Declare the variable outside of the if...else block
            // console.log('Value of bidder.marketing:', bidder.marketing, typeof bidder.marketing)

            if (bidder.marketing == 'true') {
                marketing = 'Subscribed' // Assign value inside the if block
            } else {
                marketing = 'Unsubscribed' // Assign value inside the else block
            }

            // console.log('Value of marketing:', marketing)// Log the value of marketing

            records.push({
                'Paddle Number': bidder.paddle || '',
                Name: `${bidder.first_name || ''} ${bidder.last_name || ''}`.trim(),
                Email: bidder.email_address,
                'Date Registered': formattedDate,
                'Marketing Communication': marketing, // bidder.marketing === true ? 'Subscribed' : 'Unsubscribed',
                'Bidder Status': bidder.status,
            })
        }

        await csvWriter.writeRecords(records)

        // Upload the file to S3
        const s3 = new AWS.S3({ region: 'eu-west-2' })
        const params = {
            Bucket: s3Bucket,
            Key: s3Key,
            Body: fs.createReadStream(csvFilePath),
        }

        await s3.upload(params).promise()

        // Ensure that the file is made public
        await s3.putObjectAcl({
            Bucket: s3Bucket,
            Key: s3Key,
            ACL: 'public-read',
        }).promise()

        // Generate a presigned URL
        const s3SignedUrl = s3.getSignedUrl('getObject', {
            Bucket: s3Bucket,
            Key: s3Key,
            Expires: 3600,
        })

        // console.log('CSV file uploaded successfully.')
        // console.log('Presigned URL:', s3SignedUrl)

        return s3SignedUrl
    } catch (err) {
        console.error('Error:', err)
        return null
    }
}

module.exports.handler = async (event) => {
    try {
        /** Establish database connection */
        connection = await mongodbHelper.connect()
        const emailAddress = decodeURIComponent(event.pathParameters.seller_email)
        const auctionId = decodeURIComponent(event.pathParameters.auction_id)
        /** Extract user and query parameters from the event */
        const { queryStringParameters: queryParams } = event

        /** Prepare MongoDB query conditions */
        const mongoose_query = {
            $and: [],
        }

        /** Define default sorting */
        let theSort = {
            created_at: -1,
        }

        /** Customize sorting based on query parameters */
        if (queryParams?.sort_by && queryParams?.sort_order) {
            const sort = {}
            sort[queryParams.sort_by] = queryParams.sort_order
            theSort = sort
        }

        /** Apply search filter if present in query parameters */
        if (queryParams?.search) {
            queryParams.search = queryParams.search.replace(/[.*+?^${}&$#'=(\-)|[\]\\]/g, '\\$&')
            mongoose_query.$and.push({
                $or: [
                    { name: { $regex: queryParams.search, $options: 'i' } },
                ],
            })
        }

        /** Configure pagination and sorting options */
        const options = {
            page: parseInt(queryParams?.page, 10) || 1,
            limit: queryParams?.limit ? parseInt(queryParams.limit, 10) : 10,
            sort: theSort,
        }

        /** Apply additional conditions */
        mongoose_query.$and.push({ seller_email: emailAddress, auction_id: auctionId })
        // mongoose_query.$and.push({ deleted: false })

        /** Define projection to exclude unnecessary fields */
        options.projection = {
            _id: 1,
            auction_id: 1,
            name: 1,
            first_name: 1,
            last_name: 1,
            created_at: 1,
            paddle: 1,
            marketing: 1,
            status: 1,
            email_address: 1,
        }

        if (queryParams?.export === 'true') {
            console.log('Exporting to CSV...')
            // Fetch all documents without pagination
            const buyerList = await RegisteredUser.find(mongoose_query).sort(options.sort)

            if (!buyerList || buyerList.length === 0) {
                console.error('Error: No documents found.')
                return {
                    statusCode: 404,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({
                        message: 'Buyers not found',
                    }),
                }
            }

            // Export to CSV
            const download_link = await exportAsCsv(buyerList)
            // console.log('Download link:', download_link)
            console.log('data', buyerList.docs)

            /** Return successful response with CSV download link */
            return {
                statusCode: 200,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    data: buyerList,
                    download_link: download_link,
                    pagination: {
                        total_pages: buyerList.totalPages,
                        limit: buyerList.limit,
                        total_records: buyerList.totalDocs,
                        next_page: buyerList.nextPage,
                        page: buyerList.page,
                    },
                }),
            }
        }
        // Fetch buyers list with pagination
        const buyerList = await mongodbHelper.list(RegisteredUser, mongoose_query, options)

        if (buyerList.docs.length <= 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Buyers not found',
                }),
            }
        }

        /** Return successful response with buyers data and pagination info */
        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                data: buyerList.docs,
                pagination: {
                    total_pages: buyerList.totalPages,
                    limit: buyerList.limit,
                    total_records: buyerList.totalDocs,
                    next_page: buyerList.nextPage,
                    page: buyerList.page,
                },
            }),
        }
    } catch (error) {
        /** Log and handle errors */
        console.error(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'There was an error while listing the enterprises',
            }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
