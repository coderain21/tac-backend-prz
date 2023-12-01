/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/order */
const express = require('express')
const { Socket } = require('socket.io')

const app = express()
const port = 3000
const http = require('http').createServer(app) // Pass 'app' to createServer
const io = require('socket.io')(http)
const { createClient } = require('redis')
const mongoose = require('mongoose')

// Enable environment variables from .env file
require('dotenv').config()

const bidInformationSchema = new mongoose.Schema({
    user_name: String,
    auction_id: String,
    starting_bid_amount: Number,
    current_bid_amount: Number,
    first_name: String,
    last_name: String,
})

const BidInformation = mongoose.model('BidInformation', bidInformationSchema)

async function connectM() {
    console.log('hello')
    try {
        const URL = 'mongodb://develop:develop!7edge@indy-auction.cimvoiv4bc2g.eu-west-2.docdb.amazonaws.com:27017/indyauction-develop?directConnection=true&authMechanism=DEFAULT&authSource=indyauction-develop&retryWrites=false'
        const connection = await mongoose.connect(URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        console.log('MongoDB connected successfully')
        return connection
    } catch (err) {
        console.log('MongoDB connection error:', err)
        return false
    }
}

// Register the 'connect-to-auction' event listener here, outside the 'io.on' block
io.on('connection', (socket) => {
    console.log('New Client is Connected!')

    // Send a welcome message
    socket.emit('connect-to-client', 'Hello and Welcome to the Server')

    // Event listener for 'connect-to-auction'
    socket.on('connect-to-auction', async (data) => {
        console.log('entering')
        const connection = await connectM() // Await the connection
        if (connection) {
            // Parse the data back into an object
            const parsedData = JSON.parse(data)
            console.log(parsedData)
            const database = connection.connection.db // Access the database
            const collection = database.collection('dev-register-auction') // Replace with your collection name

            // Query documents based on the email address
            const query = { email_address: parsedData.buyer_id }
            const documents = await collection.find(query).toArray() // Await the query result
            console.log(documents, 'DDD')
            if (documents.length > 0) {
                socket.emit('connect-to-client', 'Authentication Success')
            } else {
                socket.disconnect(true)
            }
        }
    })

    socket.on('disconnect', () => {
        console.log('Socket Connection is Disconnected')
    })
})

// Listen on the specified port
http.listen(port, () => {
    console.log(`Server Is Running on Port: ${port}`)
})
