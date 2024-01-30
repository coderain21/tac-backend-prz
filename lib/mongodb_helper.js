/* eslint-disable no-unused-vars */
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
        const URL = process.env.MONGO_CLIENT
        const connection = await mongoose.connect(URL, { useNewUrlParser: true })
        // eslint-disable-next-line no-console
        console.log('MongoDB connected successfully')
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
        console.log('schd', schema)
        const s = await schema.save()
        console.log('s', s)
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.view = async (Users, query) => {
    try {
        const userData = await Users.find(query)
        return userData
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.update = async (Users, user_id, update_information) => {
    try {
        const updatedInformation = await Users.updateOne({ _id: user_id }, { $set: update_information })
        return updatedInformation
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.updateUsingMongoDB = async (dbUrl, dbName, collectionName, user_id, updateInformation) => {
    const client = new MongoClient(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true })
    try {
        await client.connect()
        const db = client.db(dbName)
        const collection = db.collection(collectionName)
        const updateResult = await collection.updateOne(
            { _id: user_id },
            { $set: updateInformation },
        )
        client.close()
        return updateResult
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.getAuction = async (document, Table) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection(Table)
        const query = {
            seller_email: document.seller_email, auction_id: document.auction_id, // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        } // Corrected 'document.buyer_id'
        const documents = await collection.find(query).toArray() // Await the query result
        return documents
    } catch (err) {
        return false
    }
}

module.exports.getBuyer = async (buyer_id, Table) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection(Table) // Replace with your collection name
        const query = { _id: new ObjectId(buyer_id) }
        const documents = await collection.find(query).toArray() // Await the query result
        connectionData.disconnect()
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

module.exports.lotToCart = async (lotInformation, auctionData) => {
    try {
        const getBuyerData = await this.getBuyer(lotInformation.winning_user, process.env.BUYERS_TABLE)
        const cartSchema = {
            auction_id: auctionData[0]._id.toString(),
            seller_email: auctionData[0].seller_email,
            lot_number: lotInformation.lot_number,
            lot_id: lotInformation._id,
            buyer_id: lotInformation.winning_user,
            lot_image: lotInformation.images[0].url,
            email_address: getBuyerData[0].email_address,
            bid_amount: lotInformation.bid_amount,
            percentage: auctionData[0].percentage,
            lot_title: lotInformation.title1,
            lot_title2: lotInformation.title2,
            currency: auctionData[0].currency,
            name: getBuyerData[0].first_name,
            type: auctionData[0].add_buyer_fees,
            fees: auctionData[0].fees,

        }
        // Connect to the MongoDB server
        const connectionData = await this.connect()
        const database = connectionData.connection.db
        const collection = database.collection(process.env.CARTTABLE)
        // The document to be inserted
        // Insert the document into the collection
        await collection.insertOne(cartSchema)
        return true
    } catch (err) {
        return err
    }
}

module.exports.getBidders = async (document) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection(process.env.BIDINFORMATIONTABLE) // Replace with your collection name
        // Create an index on the fields used in the $match stage
        await collection.createIndex({ seller_email: 1, auction_id: 1 })

        const pipeline = [
            {
                $match: {
                    seller_email: document.seller_email,
                    auction_id: document.auction_id,
                },
            },
            {
                $sort: { time_stamp: -1 }, // Sort by timestamp in descending order
            },
            {
                $group: {
                    _id: '$buyer_id',
                    uniqueBuyerIds: { $addToSet: '$buyer_id' },
                    latestRecord: { $first: '$$ROOT' }, // Pick the latest record for each buyer_id
                },
            },
            {
                $replaceRoot: { newRoot: '$latestRecord' }, // Replace the root with the latest records
            },
        ]

        const result = await collection.aggregate(pipeline).toArray() // Await the aggregation result
        // Close the MongoDB connection
        // await connectionData.disconnect()

        return result
    } catch (err) {
        console.log(err)
        return false
    }
}

module.exports.getAuctionLots = async (document) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db
        const collection = database.collection(process.env.LOT_COLLECTION_NAME)

        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
        }
        const documents = await collection.find(query).toArray()
        connectionData.disconnect()
        return documents
    } catch (error) {
        console.log(error)
        return false
    }
}
module.exports.getAuctionsLots = async (document, timestamp) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db
        const collection = database.collection(process.env.LOT_COLLECTION_NAME)

        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
            end_date: { $lt: timestamp },
        }
        const documents = await collection.find(query).toArray()
        return documents
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.getUser = async (query, db_collection) => {
    try {
        const connectionData = await this.connect()
        const database = connectionData.connection.db
        const collection = database.collection(db_collection) // Replace with your collection name
        const documents = await collection.find(query).toArray() // Await the query result
        // connectionData.disconnect()
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

/**
 * Function to proisify the mongoose pagination query
 * @param {Object} Schema - Mongoose Schema Object
 * @param {Object} query - Database object
 * @param {Object} options - Database object
 * @returns {Array} List of document
 */
module.exports.list = (schema, query, options) => new Promise((resolve, reject) => {
    try {
        schema.paginate(query, options, (error, documents) => {
            if (error) {
                reject(error)
            }
            if (documents) {
                resolve(documents)
            }
        })
    } catch (error) {
        console.error(error, 'error occured')
        reject(error)
    }
})

/**
 * Function to proisify the mongoose pagination query
 * @param {Object} Schema - Mongoose Schema Object
 * @param {Object} query - Database object
 * @param {Object} options - Database object
 * @returns {Array} List of document
 */
module.exports.getLatestRecord = async (lotInformation, BidInformation) => {
    try {
        const connectionData = await this.connect()
        const query = {
            buyer_id: lotInformation.winning_user,
            lot_id: lotInformation._id,
        }

        const options = {
            sort: {
                created_at: -1, // Sorting in descending order by bid_amount (highest first)
            },
            select: {
                _id: 1, // Exclude the _id field from the result
                created_at: 1,
                name: 1,
                bid_amount: 1,

                // Add other fields you want to include in the result
            },
        }

        const highestBid = await BidInformation.findOne(query, null, options).lean()
        const update_information = {
            bid_status: 'Won',
        }
        await BidInformation.updateOne({ _id: highestBid._id }, { $set: update_information })
        return highestBid
    } catch (error) {
        return error
    }
}

module.exports.commonUpdate = async (RegisteredUser, query, update_information) => {
    try {
        console.log(query, update_information, RegisteredUser)
        const updateUser = await RegisteredUser.updateOne(query, { $set: update_information })
        return updateUser
    } catch (error) {
        console.log(error)
        return false
    }
}
