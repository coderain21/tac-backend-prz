module.exports.getLowestBidder = async (lotId, Bid) => {
    try {
        const query = {
            lot_id: lotId,
        }

        const options = {
            sort: {
                bid_amount: -1, // Sorting in ascending order by bid_amount (lowest first)
                updated_at: 1,
            },
            select: {
                bid_amount: 1,
                name: 1,
                _id: 1,
                updated_at: 1,

                // Add other fields you want to include in the result
            },
        }
        const lowestBid = await Bid.find(query, null, options).lean()
        return lowestBid
    } catch (error) {
        return error
    }
}

module.exports.getNewTopBidderAfterDeletion = async (lotId, deletedBidderId, Bid) => {
    try {
        const query = {
            lot_id: lotId,
            buyer_id: { $ne: deletedBidderId },
        }

        const options = {
            sort: {
                bid_amount: -1, // Sorting in descending order by bid_amount (highest first)
                updated_at: 1,
            },
            select: {
                bid_amount: 1,
                name: 1,
                _id: 1,
                updated_at: 1,
                buyer_id: 1,
                paddle_number: 1,
                max_bid: 1,
                // Add other fields you want to include in the result
            },
        }
        // Get the highest bid that is not from the deleted bidder
        const newTopBid = await Bid.findOne(query, null, options).lean()
        return newTopBid
    } catch (error) {
        return error
    }
}
