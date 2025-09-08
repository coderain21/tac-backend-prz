/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const { ObjectId } = require('mongodb')
const mongoConnection = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const Counter = require('../entities/Counter')
const Buyer = require('../entities/Buyers')
const Wishlist = require('../entities/BuyerWishlist')
const helpers = require('../lib/helper')

let connection = null

// Function to escape special characters for regex
function prependBackslash(text) {
    if (!text) return text
    const specialCharsPattern = /([\\.*+?()|[\]{}^$])/g
    return text.replace(specialCharsPattern, '\\$1')
}

// Function to check if wishlist is enabled and relevant for buyer
async function wishlistEnabledAndRelevant(buyerId) {
    if (!buyerId) {
        return false
    }
    try {
        const count = await Wishlist.countDocuments({ buyer_id: new ObjectId(buyerId) })
        return count > 0
    } catch (error) {
        console.log('Error checking wishlist:', error)
        return false
    }
}

// Function to get lots based on search criteria and sorting
async function getLots(auctionId, sellerEmail, buyerId, searchKeyword, sortParam) {
    const escapedSearchKeyword = prependBackslash(searchKeyword)

    let searchCriteria = {}
    if (searchKeyword) {
        searchCriteria = {
            $or: [
                { title1: { $regex: `.*${escapedSearchKeyword}.*`, $options: 'i' } },
                { title2: { $regex: `.*${escapedSearchKeyword}.*`, $options: 'i' } },
                { tags: { $elemMatch: { $regex: `.*${escapedSearchKeyword}.*`, $options: 'i' } } },
            ],
        }
    }

    // Determine sort criteria
    let sortField = 'lot_number'
    let sortOrder = 1

    switch (sortParam) {
    case 'highest_price':
        sortField = 'reserve'
        sortOrder = -1
        break
    case 'lowest_price':
        sortField = 'reserve'
        sortOrder = 1
        break
    default:
        sortField = 'lot_number'
        sortOrder = 1
    }

    // Build base query
    const baseQuery = {
        auction_id: auctionId,
        seller_email: sellerEmail,
        ...searchCriteria,
    }

    // If wishlist functionality is not needed or buyer_id is not provided, use simple query
    if (!buyerId || !await wishlistEnabledAndRelevant(buyerId)) {
        const lots = await Lot.find(baseQuery)
            .sort({ [sortField]: sortOrder })
            .lean()

        // Add is_wishlisted: false to all lots
        return lots.map((lot) => ({ ...lot, is_wishlisted: false }))
    }

    // For wishlist functionality, we need to use aggregation
    // Since Mongoose entities might not support complex aggregation easily,
    // we'll fall back to collection access for this specific case
    const { db } = connection.connection
    const lotCollection = db.collection(process.env.LOT_COLLECTION_NAME || 'lots')

    try {
        const buyerDetails = await Buyer.findById(buyerId).lean()
        const buyerEmail = buyerDetails?.email_address

        if (!buyerEmail) {
            // If buyer not found, return lots without wishlist info
            const lots = await Lot.find(baseQuery)
                .sort({ [sortField]: sortOrder })
                .lean()
            return lots.map((lot) => ({ ...lot, is_wishlisted: false }))
        }

        // Build aggregation pipeline for wishlist functionality
        const aggregationPipeline = [
            { $match: baseQuery },
            {
                $lookup: {
                    from: process.env.BUYER_WISHLIST_TABLE,
                    localField: '_id',
                    foreignField: 'lot_id',
                    as: 'wishlist',
                },
            },
            {
                $addFields: {
                    is_wishlisted: {
                        $in: [buyerEmail, '$wishlist.email_address'],
                    },
                },
            },
            { $sort: { [sortField]: sortOrder } },
            { $project: { wishlist: 0 } },
        ]

        console.log('Aggregation pipeline:', JSON.stringify(aggregationPipeline, null, 2))
        const searchResult = await lotCollection.aggregate(aggregationPipeline).toArray()
        return searchResult
    } catch (error) {
        console.log('Error in wishlist aggregation:', error)
        // Fallback to simple query without wishlist
        const lots = await Lot.find(baseQuery)
            .sort({ [sortField]: sortOrder })
            .lean()
        return lots.map((lot) => ({ ...lot, is_wishlisted: false }))
    }
}

module.exports.list_lots = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const data = event.queryStringParameters || {}
        const auctionId = data.auction_id
        const buyerId = data.buyer_id

        if (!auctionId) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Please provide auction_id' }),
            }
        }

        // Try to convert the auction_id string to a MongoDB ObjectId
        let objectId
        try {
            objectId = new ObjectId(auctionId)
        } catch (error) {
            console.log('Error:', error.message)
            return {
                statusCode: 422,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Invalid auction ID format' }),
            }
        }

        // Find auction details using Auction entity
        const auctionDetails = await Auction.findById(objectId, { _id: 1, auction_id: 1, seller_email: 1 }).lean()

        if (!auctionDetails) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Auction not found' }),
            }
        }

        const sellerEmail = auctionDetails.seller_email
        const auctionIdFromDb = auctionDetails.auction_id

        const sortParam = data.sort_by || ''
        const searchKeyword = data.search || ''
        const perPage = parseInt(data.per_page, 10) || 10
        console.log('perPage', perPage)
        const page = parseInt(data.page || '1', 10)

        // Get lots using the enhanced function
        const lotsList = await getLots(auctionIdFromDb, sellerEmail, buyerId, searchKeyword, sortParam)

        const totalLots = lotsList.length
        const totalPages = perPage > 0 ? Math.ceil(totalLots / perPage) : 1

        // Apply pagination if per_page is specified
        let paginatedLots = lotsList
        if (perPage > 0) {
            const startIndex = (page - 1) * perPage
            const endIndex = Math.min(startIndex + perPage, totalLots)
            console.log('startIndex', startIndex, 'endIndex', endIndex)
            paginatedLots = lotsList.slice(startIndex, endIndex)
        }

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                data: paginatedLots,
                page,
                total_pages: totalPages,
                total_records: totalLots,
            }),
        }
    } catch (error) {
        console.log('Error:', error.message)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: error.message }),
        }
    }
}
