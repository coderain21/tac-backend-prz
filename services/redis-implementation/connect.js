/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable import/no-extraneous-dependencies */

const { createClient } = require('redis')
const mongoose = require('mongoose')
// const mongoConnection = require('../lib/mongodb_helper')

// eslint-disable-next-line import/no-extraneous-dependencies
require('dotenv').config()

async function connectM() {
    console.log('hello')
    try {
        const URL = 'mongodb://develop:develop!7edge@indy-auction.cimvoiv4bc2g.eu-west-2.docdb.amazonaws.com:27017/indyauction-develop?directConnection=true&authMechanism=DEFAULT&authSource=indyauction-develop&retryWrites=false'
        const connection = await mongoose.connect(URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        // eslint-disable-next-line no-console
        console.log('MongoDB connected successfully')
        return connection
    } catch (err) {
        console.log('MongoDB connection error:', err)
        return false
    }
}

// Define a schema for your bid information
const bidInformationSchema = new mongoose.Schema({
    user_name: String,
    auction_id: String,
    starting_bid_amount: Number,
    current_bid_amount: Number,
    first_name: String,
    last_name: String,
})

// Create a Mongoose model for the bid_information collection
const BidInformation = mongoose.model('BidInformation', bidInformationSchema)

async function insertData() {
    try {
        // Store data in Redis
        // await redisClient.set('user:johndoe', JSON.stringify(data))
        // const mongoConnect = await connectM()
        // console.log('mongoConnect', mongoConnect)
        const bidInformation = {
            user_name: 'shrinith@7edge.com',
            auction_id: 'asdas@#4455566bcb',
            starting_bid_amunt: 1000,
            current_bid_amount: 400,
            first_name: 'Shrinith',
            last_name: 'S',
        }
        const connections = await connectM()
        const bidDoc = new BidInformation(bidInformation)
        const savedX = await bidDoc.save()
        console.log('savedX', savedX)
        const client = createClient()
        const connection = await client.connect()
        const userData = await connection.set('user:Shrinith', JSON.stringify(bidInformation))
        console.log('user data', userData)
        if (userData === 'OK') {
            console.log('Data not found in Redis')
        } else {
            const parsedData = JSON.parse(userData)
            console.log('Retrieved data:', parsedData)
        }
        await connection.disconnect()
        client.quit()
    } catch (error) {
        console.error('Error:', error)
    }
}

// Call the insertData function to insert data into Redis
insertData()

// Close the Redis client when done
// redisClient.quit()
