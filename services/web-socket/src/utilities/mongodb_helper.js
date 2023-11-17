/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-self-import */
/* eslint-disable camelcase */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
const mongoose = require('mongoose')
const { ObjectId } = require('mongodb')
const { MongoClient } = require('mongodb')

// eslint-disable-next-line import/no-extraneous-dependencies
require('dotenv').config()

/* This code exports a function named `connect` as a property of the `module.exports` object. The
`connect` function uses the `mongoose` library to connect to a MongoDB database using the connection
string specified in the `process.env.MONGODB_CONNECTION_STRING` environment variable. If the
connection is successful, the function logs a success message to the console and returns the
connection object. If the connection fails, the function logs an error message to the console and
returns `false`. The function is marked as `async` because it uses `await` to wait for the
connection to be established before returning the connection object or error. */

module.exports.connect = async () => {
    try {
        const URL = 'mongodb://develop:develop!7edge@indy-auction.cimvoiv4bc2g.eu-west-2.docdb.amazonaws.com:27017/indyauction-develop?directConnection=true&authMechanism=DEFAULT&authSource=indyauction-develop&retryWrites=false'
        const connection = await mongoose.connect(URL, { useNewUrlParser: true })
        return connection
    } catch (err) {
        console.log('MongoDB connection error:', err)
        return false
    }
}
/* `module.exports.save` is a function that takes in two parameters: `document` and `Schema`. It
creates a new instance of the `Schema` model using the `document` parameter, and then saves it to
the MongoDB database using the `save()` method. If the save operation is successful, the function
returns `true`. If there is an error during the save operation, the function logs the error to the
console and returns `false`. This function can be used to save documents to the database using the
specified schema. */
module.exports.save = async (document, Schema) => {
    try {
        const schema = new Schema(document)
        await schema.save()
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.getAllBidders = async (document) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection('dev-bid-informations') // Replace with your collection name
        const query = {
            seller_email: document.seller_email, auction_id: document.auction_id, lot_id: document.lot_id, buyer_id: document.buyer_id, // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        } // Corrected 'document.buyer_id'
        const documents = await collection.find(query).toArray() // Await the query result
        connectionData.disconnect()
        return documents
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.updatingBuyer = async (document, amount) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection('dev-bid-informations') // Replace with your collection name
        await collection.updateOne(
            { _id: new ObjectId(document._id) },
            {
                $set: {
                    max_bid: amount,
                },
            },
        )
        connectionData.disconnect()
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.changeStatus = async (allBidders) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db // Access the database
        const collection = database.collection('dev-bid-informations')
        const winningBuyers = allBidders.filter((bid) => bid.bid_status === 'Winning')
        if (winningBuyers.length > 0) {
            const updateResult = await collection.updateMany(
                { buyer_id: { $in: winningBuyers.map((bid) => bid.buyer_id) } },
                { $set: { bid_status: 'Not Winning' } },
            )

            if (updateResult.modifiedCount > 0) {
                console.log(`Status updated to 'Not Winning' for ${updateResult.modifiedCount} buyers.`)
            } else {
                console.log('Status not updated. No matching documents found.')
            }
        } else {
            console.log('No bidders with Winning status found.')
        }
        await connectionData.disconnect()
        return true
    } catch (err) {
        return err
    }
}

module.exports.changeStartingBid = async (data) => {
    console.log('1111111111111111111111111111111111111')
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db // Access the database
        const collection = database.collection('dev-lots')
        await collection.updateOne(
            { _id: new ObjectId(data.lot_id) },
            {
                $set: {
                    starting_price_status: 'Changed', current_bid: data.current_bid,
                },
            },
        )

        await connectionData.disconnect()
        return true
    } catch (err) {
        console.log(err)
        return err
    }
}

module.exports.updateTopBidder = async (data, updateInformation) => {
    try {
        const client = await this.connect()
        const database = client.connection.db // Access the database
        const collection = database.collection('dev-lots') //
        const updateResult = await collection.updateOne(
            { _id: new ObjectId(data.lot_id) },
            {
                $set: {
                    Top_bidder: updateInformation.buyer_id, paddle_number: updateInformation.paddle_number, current_bid: data.max_bid,
                },
                $push: {
                    bidder_socket_id: data.socket_id,
                },
            },
        )
        client.disconnect()
        return updateResult
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.getAuction = async (document) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection('dev-auctions') // Replace with your collection name
        const query = {
            seller_email: document.seller_email, auction_id: document.auction_id, // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        } // Corrected 'document.buyer_id'
        console.log('query', query)
        const documents = await collection.find(query).toArray() // Await the query result
        connectionData.disconnect()
        return documents
    } catch (err) {
        return false
    }
}

module.exports.getAllLots = async (document) => {
    try {
        console.log('document', document)
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection('dev-lots') // Replace with your collection name
        const query = {
            seller_email: document.seller_email, auction_id: document.auction_id, // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        } // Corrected 'document.buyer_id'
        const documents = await collection.find(query).toArray() // Await the query result
        console.log(documents[0], 'got lots')
        const updateResult = await collection.updateMany(
            { _id: { $in: documents.map((lot) => ObjectId(lot._id)) } },
            { $set: { is_extended: true, extension_time: document.extension_time,  } },
        )
        connectionData.disconnect()
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}
