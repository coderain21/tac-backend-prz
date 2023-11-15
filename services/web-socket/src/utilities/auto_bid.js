const mongodbHelper = require('./mongodb_helper')

/* eslint-disable no-param-reassign */
async function calculateNextBid(currentBid) {
    try {
        // Extract the first digit of the current bid
        const firstDigit = parseInt(currentBid.toString()[0], 10)
        let nextBid

        if (firstDigit === 1) {
        // If the first digit is 1, increase by 10
            nextBid = currentBid + 10
        } else if (firstDigit === 2) {
        // If the first digit is 2, increase by 20
            nextBid = currentBid + 20
        } else if (firstDigit === 3 || firstDigit === 4) {
        // If the first digit is 3 or 4, follow the pattern 0 - 2 - 5 - 8
            const lastDigit = parseInt(currentBid.toString().slice(-1), 10)
            const pattern = [0, 2, 5, 8]
            const nextDigit = pattern[(pattern.indexOf(lastDigit) + 1) % pattern.length]
            nextBid = currentBid + (nextDigit - lastDigit)
        } else if (firstDigit >= 5 && firstDigit <= 9) {
        // If the first digit is 5 to 9, increase by 5
            nextBid = currentBid + 5
        } else {
        // For other cases, increase by 1
            nextBid = currentBid + 1
        }
        return nextBid
    } catch (err) {
        return err
    }
}

module.exports.checkAutoBid = async (record, all_bidders) => {
    console.log('enteringggg', record)
    const maxBidAmount = record.max_bid
    let message
    let bidStatus = 'Not Winning'
    try {
        const getNextAmount = await calculateNextBid(record.starting_bid)
        if (all_bidders.length > 0) {
            const highestBid = Math.max(...all_bidders.map((bid) => bid.max_bid))
            const highestBidder = all_bidders.find((bid) => bid.max_bid === highestBid)
            console.log('higgesr', highestBidder)
            if (highestBidder.base_price > record.max_bid) {
                const amount = await calculateNextBid(record.max_bid)
                record.max_bid = amount
                record.base_price = highestBidder.base_price
                record.current_bid = amount
            }
            if (record.buyer_id === highestBidder.buyer_id) {
                message = 'Congratulations, you won the bid!'
                bidStatus = 'Winning'
            } else {
                message = 'Not Winning'
            }
        } else if (getNextAmount !== record.max_bid) {
            console.log('entreryu')
            message = 'Congratulations, you won the bid!'
            bidStatus = 'Winning'
            record.max_bid = getNextAmount
            record.base_price = maxBidAmount
            record.current_bid = getNextAmount
        }
        await mongodbHelper.changeStartingBid(record)

        return { record, message, bidStatus }
    } catch (error) {
        console.error(error)
        return false
    }
}
