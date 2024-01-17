module.exports.getLowestBidder = async (lotId, Bid) => {
    try {
        const query = {
            lot_id: lotId,
        }

        const options = {
            sort: {
                bid_amount: -1, // Sorting in ascending order by bid_amount (lowest first)
            },
            select: {
                bid_amount: 1,
                name: 1,
                _id: 1,

                // Add other fields you want to include in the result
            },
        }
        const lowestBid = await Bid.find(query, null, options).lean()
        return lowestBid
    } catch (error) {
        return error
    }
}
