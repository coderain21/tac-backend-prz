/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
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
        exportAsCsv: params?.export === 'true' || params?.export === '1',
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
            // exportAsCsv,
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

        const [bidsDocs, count] = await Promise.all([
            liveBids.find(finalQuery)
                .select(projection)
                .sort(sortCriteria)
                .limit(perPage)
                .skip((page - 1) * perPage)
                .lean(),
            liveBids.countDocuments(finalQuery),
        ])

        const response = {}
        const lots = bidsDocs
        const totalCount = count
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
