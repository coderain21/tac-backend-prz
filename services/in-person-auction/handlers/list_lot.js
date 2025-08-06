/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const mongoConnection = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const Counter = require('../entities/Counter')
const helpers = require('../lib/helper')


let connection = null

module.exports.list_lot = async (event) => {
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

    try {
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const { queryStringParameters } = event
        console.log('queryStringParameters', queryStringParameters)
        const auctionId = queryStringParameters?.auction_id
        const sortBy = queryStringParameters?.sort_by || 'lot_number'
        const sortOrder = queryStringParameters?.sort_order || 'ascending'
        const searchKeyword = queryStringParameters?.search_keyword
        const page = queryStringParameters?.page || 1
        const perPage = queryStringParameters?.per_page || 10


        if (!auctionId) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Please provide auction ID' }),
            }
        }

        const sellerEmail = event.requestContext.authorizer.claims['cognito:username']

        const query = { auction_id: auctionId, seller_email: sellerEmail }

        const auctionData = await Auction.findOne(query)
        if (!auctionData || auctionData.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        const sortCriteria = {}
        if (['reserve', 'lot_number', 'title1', 'absentee_bids', 'telephone_bids'].includes(sortBy)) {
            sortCriteria[sortBy] = sortOrder === 'ascending' ? 1 : -1
        }

        const searchCriteria = {}
        if (searchKeyword) {
            searchCriteria.$or = [
                { title1: { $regex: searchKeyword, $options: 'i' } },
                { title2: { $regex: searchKeyword, $options: 'i' } },
            ]
        }

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

        const lots = await Lot.find(query).select(projection)
            .sort(sortCriteria)
            .limit(perPage)
            .skip((page - 1) * perPage)
        const response = {
            lots,
            total_records_found: await Lot.countDocuments(query),
            total_pages: Math.ceil(await Lot.countDocuments(query) / perPage),
            current_page: parseInt(page, 10),
        }

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify(response),
        }
    } catch (error) {
        console.log('Error', error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Internal server error' }),
        }
    }
}
