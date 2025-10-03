/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const mongoConnection = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const LiveBid = require('../entities/LiveBid')
const helpers = require('../lib/helper')

let connection = null

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
 * Validates query parameters
 * @param {Object} params - Query string parameters
 * @returns {Object} Validated parameters
 */
function validateQueryParams(params) {
    return {
        auctionId: params?.auction_id,
    }
}

/**
 * Gets auction statistics: telephone bids count, absentee bids sum, and active bidders count
 * @param {string} auctionId - The auction ID
 * @param {string} sellerEmail - The seller email
 * @returns {Object} Statistics object
 */
async function getAuctionStatistics(auctionId, sellerEmail) {
    try {
        const pipeline = [
            {
                $match: {
                    auction_id: auctionId,
                    seller_email: sellerEmail,
                },
            },
            {
                $group: {
                    _id: null,
                    // Count telephone bids
                    telephoneBidsCount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$bid_type', 'telephone'] },
                                1,
                                0,
                            ],
                        },
                    },
                    // Sum of absentee bid amounts
                    absenteeBidsSum: {
                        $sum: {
                            $cond: [
                                { $eq: ['$bid_type', 'absentee'] },
                                '$bid_amount',
                                0,
                            ],
                        },
                    },
                    // Count unique active bidders (using addToSet to get unique buyer_ids)
                    uniqueBidders: {
                        $addToSet: '$buyer_id',
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    telephoneBidsCount: 1,
                    absenteeBidsSum: 1,
                    activeBiddersCount: { $size: '$uniqueBidders' },
                },
            },
        ]

        const result = await LiveBid.aggregate(pipeline)

        if (result.length > 0) {
            return {
                telephoneBidsCount: result[0].telephoneBidsCount || 0,
                absenteeBidsSum: result[0].absenteeBidsSum || 0,
                activeBiddersCount: result[0].activeBiddersCount || 0,
            }
        }

        return {
            telephoneBidsCount: 0,
            absenteeBidsSum: 0,
            activeBiddersCount: 0,
        }
    } catch (error) {
        console.error('Error getting auction statistics:', error)
        return {
            telephoneBidsCount: 0,
            absenteeBidsSum: 0,
            activeBiddersCount: 0,
        }
    }
}

/**
 * Alternative approach: Get statistics with more detailed breakdown
 * @param {string} auctionId - The auction ID
 * @param {string} sellerEmail - The seller email
 * @returns {Object} Detailed statistics object
 */
async function getDetailedAuctionStatistics(auctionId, sellerEmail) {
    try {
        const pipeline = [
            {
                $match: {
                    auction_id: auctionId,
                    seller_email: sellerEmail,
                },
            },
            {
                $facet: {
                    // Telephone bids statistics
                    telephoneStats: [
                        {
                            $match: { bid_type: 'telephone' },
                        },
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 },
                                totalAmount: { $sum: '$bid_amount' },
                                averageAmount: { $avg: '$bid_amount' },
                                maxAmount: { $max: '$bid_amount' },
                            },
                        },
                    ],
                    // Absentee bids statistics
                    absenteeStats: [
                        {
                            $match: { bid_type: 'absentee' },
                        },
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 },
                                totalAmount: { $sum: '$bid_amount' },
                                averageAmount: { $avg: '$bid_amount' },
                                maxAmount: { $max: '$bid_amount' },
                            },
                        },
                    ],
                    // Active bidders count
                    activeBidders: [
                        {
                            $group: {
                                _id: '$buyer_id',
                            },
                        },
                        {
                            $count: 'totalUniqueBidders',
                        },
                    ],
                },
            },
        ]

        const result = await LiveBid.aggregate(pipeline)

        if (result.length > 0) {
            const stats = result[0]

            return {
                telephoneBids: {
                    count: stats.telephoneStats[0]?.count || 0,
                    totalAmount: stats.telephoneStats[0]?.totalAmount || 0,
                    averageAmount: stats.telephoneStats[0]?.averageAmount || 0,
                    maxAmount: stats.telephoneStats[0]?.maxAmount || 0,
                },
                absenteeBids: {
                    count: stats.absenteeStats[0]?.count || 0,
                    totalAmount: stats.absenteeStats[0]?.totalAmount || 0,
                    averageAmount: stats.absenteeStats[0]?.averageAmount || 0,
                    maxAmount: stats.absenteeStats[0]?.maxAmount || 0,
                },
                activeBiddersCount: stats.activeBidders[0]?.totalUniqueBidders || 0,
            }
        }

        return {
            telephoneBids: {
                count: 0, totalAmount: 0, averageAmount: 0, maxAmount: 0,
            },
            absenteeBids: {
                count: 0, totalAmount: 0, averageAmount: 0, maxAmount: 0,
            },
            activeBiddersCount: 0,
        }
    } catch (error) {
        console.error('Error getting detailed auction statistics:', error)
        return {
            telephoneBids: {
                count: 0, totalAmount: 0, averageAmount: 0, maxAmount: 0,
            },
            absenteeBids: {
                count: 0, totalAmount: 0, averageAmount: 0, maxAmount: 0,
            },
            activeBiddersCount: 0,
        }
    }
}

/**
 * Main Lambda handler for auction statistics
 */
module.exports.auction_stats = async (event) => {
    try {
        // Authorization check
        const sellerEmail = checkAuthorization(event)

        // Database connection
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        // Validate query parameters
        const { auctionId } = validateQueryParams(event.queryStringParameters)

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

        // Get auction statistics
        const statistics = await getAuctionStatistics(auctionId, sellerEmail)

        // Build response
        const response = {
            auction_id: auctionId,
            statistics: {
                number_of_telephone_bids: statistics.telephoneBidsCount,
                sum_of_absentee_bids: statistics.absenteeBidsSum,
                number_of_active_bidders: statistics.activeBiddersCount,
            },
        }

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify(response),
        }
    } catch (error) {
        console.error('Error in auction_statistics:', error)

        // Handle authorization errors
        if (error.message === 'Unauthorized') {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

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

/**
 * Alternative handler for detailed statistics
 */
module.exports.detailed_auction_statistics = async (event) => {
    try {
        // Authorization check
        const sellerEmail = checkAuthorization(event)

        // Database connection
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        // Validate query parameters
        const { auctionId } = validateQueryParams(event.queryStringParameters)

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

        // Get detailed auction statistics
        const detailedStats = await getDetailedAuctionStatistics(auctionId, sellerEmail)

        // Build response
        const response = {
            auction_id: auctionId,
            detailed_statistics: detailedStats,
        }

        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify(response),
        }
    } catch (error) {
        console.error('Error in detailed_auction_statistics:', error)

        // Handle authorization errors
        if (error.message === 'Unauthorized') {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

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
