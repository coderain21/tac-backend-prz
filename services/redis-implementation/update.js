/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable import/no-extraneous-dependencies */

const { createClient } = require('redis')
const mongoose = require('mongoose')

// Load environment variables if needed
// require('dotenv').config();

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

async function updateData() {
    try {
        const newName = 'NewShrinith' // The updated name

        // Find the existing data in MongoDB
        const query = { user_name: 'shrinith@7edge.com' }
        const updatedData = {
            $set: { first_name: newName },
        }

        const connectionM = await connectM()
        const updatedDoc = await BidInformation.findOneAndUpdate(query, updatedData, { new: true })

        if (updatedDoc) {
            console.log('Data updated in MongoDB:', updatedDoc)

            // Update the corresponding data in Redis
            const client = createClient()
            const connection = await client.connect()
            const userData = await connection.set('user:Shrinith', JSON.stringify(updatedDoc))
            console.log('User data in Redis updated:', userData)
            await connectionM.disconnect()
            client.quit()
        } else {
            console.log('Data not found in MongoDB')
        }
    } catch (error) {
        console.error('Error:', error)
    }
}

// Call the updateData function to update the name in both MongoDB and Redis
updateData()
