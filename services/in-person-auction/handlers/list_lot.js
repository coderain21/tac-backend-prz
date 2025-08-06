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
const Users = require('../entities/Users')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const uniqueBidders = require('../entities/UniqueBidders')
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
        const { auctionId } = queryStringParameters
        const { sortBy = 'lot_number' } = queryStringParameters
        const { sortOrder = 'asc' } = queryStringParameters
        const { searchKeyword } = queryStringParameters
        const { page } = queryStringParameters
        const { perPage } = queryStringParameters


        const sortCriteria = {}
        if (['reserve', 'lot_number', 'title1', 'absentee_bids', 'telephone_bids'].includes(sortBy)) {
            sortCriteria[sortBy] = sortOrder === 'asc' ? 1 : -1
        }

        const searchCriteria = {}
        if (searchKeyword) {
            searchCriteria.$or = [
                { title1: { $regex: searchKeyword, $options: 'i' } },
                { title2: { $regex: searchKeyword, $options: 'i' } },
            ]
        }

        const query = { auction_id: auctionId, seller_email: sellerEmail }

        const lots = await Lot.find(query)
            .sort(sortCriteria)
            .limit(perPage)
            .skip((page - 1) * perPage)
        const response = {
            lots,
        }

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify(response),
        }
    } catch (error) {
        console.log(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Internal server error' }),
        }
    }
}
