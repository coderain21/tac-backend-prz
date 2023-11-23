/* eslint-disable no-param-reassign */
const mongoose = require('mongoose')

const mongodbHelper = require('./mongodb_helper')

const bidHistorySchema = new mongoose.Schema({
    buyer_id: String,
    auction_id: String,
    lot_id: String,
    seller_email: String,
    paddle_number: Number,
    bid_amount: Number,
    location: String,
    created_at: { type: Date, default: Date.now },
})

const BidInformation = mongoose.model('dev-bid-history', bidHistorySchema)

module.exports.saveBidHistory = async (data) => {
    try {
        const connectionData = await mongodbHelper.connect()
        data.bid_amount = data.max_bid
        const bidDoc = new BidInformation(data)
        await bidDoc.save()
        await connectionData.disconnect()
    } catch (err) {
        return err
    }
}

module.exports.joinBidRoom = async (socket, lotID) => {
    try {
        socket.join(lotID)
    } catch (err) {
        return err
    }
}
