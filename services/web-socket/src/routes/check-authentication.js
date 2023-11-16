/* eslint-disable no-param-reassign */
const mongoose = require('mongoose')

const { checkBuyerAuthentication } = require('../utilities/authService')
const mongodbHelper = require('../utilities/mongodb_helper')

const buyerConnectionSchema = new mongoose.Schema({
    socket_id: String,
    buyer_id: String,
    auction_id: String,
    seller_email: String,
    connected: Boolean,
})

const BidInformation = mongoose.model('dev-buyer-connection', buyerConnectionSchema)

module.exports.checkAuthentication = async (socket, data) => {
    const checkUser = await checkBuyerAuthentication(data)
    let response = 'User Not Authenticated'
    let connection = false
    const connectionData = await mongodbHelper.connect()
    if (checkUser) {
        response = 'User Authenticated'
        connection = true
    }
    socket.emit('checkAuthentication', { status: true, data: response })
    const criteria = {
        buyer_id: data.buyer_id,
        auction_id: data.auction_id,
    }
    data.connected = connection
    const existingRecord = await BidInformation.findOne(criteria)
    if (existingRecord) {
        existingRecord.set(data)
        await existingRecord.save()
    } else {
        const bidDoc = new BidInformation(data)
        await bidDoc.save()
    }
    await connectionData.disconnect()
}
