/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-self-import */
/* eslint-disable camelcase */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
const mongoose = require('mongoose')
const { ObjectId } = require('mongodb')
const { MongoClient } = require('mongodb')


/* This code exports a function named `connect` as a property of the `module.exports` object. The
`connect` function uses the `mongoose` library to connect to a MongoDB database using the connection
string specified in the `process.env.MONGODB_CONNECTION_STRING` environment variable. If the
connection is successful, the function logs a success message to the console and returns the
connection object. If the connection fails, the function logs an error message to the console and
returns `false`. The function is marked as `async` because it uses `await` to wait for the
connection to be established before returning the connection object or error. */

module.exports.connect = async () => {
    try {
        const URL = 'mongodb://develop:develop!7edge@indy-auction.cimvoiv4bc2g.eu-west-2.docdb.amazonaws.com:27017/indyauction-develop'
        const connection = await mongoose.connect(URL, { useNewUrlParser: true, useFindAndModify: false })
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

module.exports.updateSignleLot = async (document) => {
    const client = await this.connect()
    const database = client.connection.db // Access the database
    const collection = database.collection('dev-lots') //
    const updateResult = await collection.updateOne(
        { _id: new ObjectId(document.lot_id) },
        {
            $set: {
                is_extended: true, extension_time: document.extension_time, start_date: document.start_date, end_date: document.end_date,
            },
        },
    )
    client.disconnect()
    return updateResult
}
module.exports.updateTopBidder = async (updateInformation) => {
    try {
        const client = await this.connect()
        const database = client.connection.db // Access the database
        const collection = database.collection('dev-lots') //
        const updateResult = await collection.updateOne(
            { _id: new ObjectId(data.lot_id) },
            {
                $set: {
                    Top_bidder: updateInformation.buyer_id, paddle_number: updateInformation.paddle_number, current_bid: updateInformation.bid_amount,
                },
            },
        )
        client.disconnect()
        return updateResult
    } catch (error) {
        return error
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
        const documents = await collection.find(query).toArray() // Await the query result
        connectionData.disconnect()
        return documents
    } catch (err) {
        return false
    }
}
module.exports.getLot = async (lot_id) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection('dev-lots') // Replace with your collection name
        const query = {
            _id: ObjectId(lot_id), // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        } // Corrected 'document.buyer_id'
        console.log('seller', query)
        const documents = await collection.find(query).toArray() // Await the query result
        connectionData.disconnect()
        return documents
    } catch (err) {
        return false
    }
}

module.exports.getAllLots = async (document, lotData) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db
        const collection = database.collection('dev-lots')
        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
        }
        let documents
        console.log('document extensi', document)
        if (document.extension_type === 'All Lots') {
            console.log('1111111')
            documents = await collection.find(query).toArray()
            const timestamp = documents[0].end_date
            const dateObject = new Date(timestamp)
            // Get the current minutes
            const currentMinutes = dateObject.getMinutes()
            // Add 2 minutes to the current minutes
            const newMinutes = currentMinutes + parseInt(document.extension_time, 10)
            // Set the new minutes to the Date object
            dateObject.setMinutes(newMinutes)
            // Convert the Date object back to a timestamp
            const newTimestamp = dateObject.getTime()
            console.log(newTimestamp) // Output:
            const updateQuery = {
                $set: {
                    end_date: newTimestamp,
                    extended_time: document.extension_time,

                },
            }
            const x = await collection.updateMany({ _id: { $in: documents.map((lot) => ObjectId(lot._id)) } }, updateQuery)
            console.log('x', x)
        } else if (document.extension_type === 'Individual') {
            const lotId = ObjectId(lotData.lot_id)
            const timestamp = documents[0].end_date
            const dateObject = new Date(timestamp)
            // Get the current minutes
            const currentMinutes = dateObject.getMinutes()
            // Add 2 minutes to the current minutes
            const newMinutes = currentMinutes + parseInt(document.extension_time, 10)
            // Set the new minutes to the Date object
            dateObject.setMinutes(newMinutes)
            // Convert the Date object back to a timestamp
            const newTimestamp = dateObject.getTime()
            console.log(newTimestamp) // Output:
            documents = await collection.find({ ...query, _id: lotId }).toArray()
            const updateQuery = {
                $set: {
                    end_date: newTimestamp,
                    extended_time: document.extension_time,
                },
            }
            await collection.updateMany({ _id: lotId }, updateQuery)
        } else {
            const sortOptions = { lot_number: 1 }
            documents = await collection.find(query).sort(sortOptions).toArray()
            const bulkOperations = documents.map((lot) => {
                const timestamp = lot.end_date
                const dateObject = new Date(timestamp)
                // Get the current minutes
                const currentMinutes = dateObject.getMinutes()
                // Add 2 minutes to the current minutes
                const newMinutes = currentMinutes + parseInt(document.extension_time, 10)
                // Set the new minutes to the Date object
                dateObject.setMinutes(newMinutes)
                // Convert the Date object back to a timestamp
                const newTimestamp = dateObject.getTime()

                return {
                    updateOne: {
                        filter: { _id: ObjectId(lot._id) },
                        update: {
                            $set: {
                                extension_time: document.extension_time,
                                end_date: newTimestamp,
                            },
                        },
                    },
                }
            })

            await collection.bulkWrite(bulkOperations, { ordered: false })
        }

        connectionData.disconnect()
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.getAuctionLots = async (document) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db
        const collection = database.collection('dev-lots')

        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
        }
        const documents = await collection.find(query).toArray()
        return documents
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.lotToCart = async (document) => {
    try {
        // Connect to the MongoDB server
        const connectionData = await this.connect()
        const database = connectionData.connection.db
        const collection = database.collection('dev-carts')
        // The document to be inserted
        // Insert the document into the collection
        const result = await collection.insertOne(document)
        return true
    } catch (err) {
        return err
    }
}

module.exports.getBuyer = async (buyer_id) => {
    try {
        console.log('buyerid', buyer_id)
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection('dev-buyers') // Replace with your collection name
        const query = {
            _id: ObjectId(buyer_id), // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        } // Corrected 'document.buyer_id'
        console.log('seller', query)
        const documents = await collection.find(query).toArray() // Await the query result
        connectionData.disconnect()
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

module.exports.saveBidHistory = async (document) => {
    try {
        // Connect to the MongoDB server
        const connectionData = await this.connect()
        const database = connectionData.connection.db
        const collection = database.collection('dev-bid-informations')
        // The document to be inserted
        // Insert the document into the collection
        const result = await collection.insertOne(document)
        return true
    } catch (err) {
        return err
    }
}
