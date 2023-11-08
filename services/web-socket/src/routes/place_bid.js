/* eslint-disable import/no-extraneous-dependencies */
const mongoose = require('mongoose')
const { createClient } = require('redis')

const mongodbHelper = require('../utilities/mongodb_helper')

const bidInformationSchema = new mongoose.Schema({
    buyer_id: String,
    auction_id: String,
    paddle_number: Number,
    starting_bid: Number,
    max_bid: Number,
    lot_id: String,
    current_bid_amount: Number,
    low_estimate: String,
    high_estimate: String,
    top_bidder: String,
    bid_status: String,
    created_at: Date,
    updated_at: Date,
})

const BidInformation = mongoose.model('dev-bid-information', bidInformationSchema)

module.exports.placeBid = async (socket, data) => {
    try {
        console.log('socket', data)
        const connectionData = await mongodbHelper.connect()
        // check any bidders are there for auction lot
        const database = connectionData.connection.db // Access the database
        const collection = database.collection('dev-bid-informations') // Replace with your collection name
        // Query documents based on the email address
        const query = { buyer_id: data.buyer_id }
        const documents = await collection.find(query).toArray() // Await the query result
        console.log(documents, 'DDD')
        let topBidder = '' //pending top bidder conditiion
        if (String(data.auction_id) === String(documents[0].auction_id) && String(data.lot_id) === String(documents[0].lot_id)) {
            console.log('inisdee')
        // creating the bidder information
            const bidDoc = new BidInformation(data)
            const savedX = await bidDoc.save()
            console.log('savedX', savedX)
            const client = createClient()
            const connection = await client.connect()
            const userData = await connection.set(`user:${data.buyer_id}`, JSON.stringify(data))
            console.log('user data', userData)
            if (userData === 'OK') {
                console.log('Data not found in Redis')
            } else {
                const parsedData = JSON.parse(userData)
                console.log('Retrieved data:', parsedData)
            }
            socket.emit('placeBid', { success: true, message: 'You are won the bid' })
            await connectionData.disconnect()
            client.quit()
        }
        socket.emit('placeBid', { success: false, message: 'You are not won the bid' })


    } catch (err) {
        console.log(err)

    }
}
