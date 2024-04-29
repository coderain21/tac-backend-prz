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
        const s = await schema.save()
        return s
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

module.exports.getAuction = async (document, Auction) => {
    try {
        console.log('AAA', Auction, document)
        const query = {
            seller_email: document.seller_email, auction_id: document.auction_id, // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        } // Corrected 'document.buyer_id'
        console.log('auctions', query)
        const documents = await Auction.findOne(query) // Await the query result
        return documents
    } catch (err) {
        return false
    }
}

module.exports.getBuyer = async (buyer_id, Buyers) => {
    try {
        const query = { _id: new ObjectId(buyer_id) }
        const documents = await Buyers.findOne(query) // Await the query result
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

module.exports.lotToCart = async (lotInformation, auctionData, Cart) => {
    try {
        console.log('acrt', Cart)
        const cartSchema = {
            auction_id: auctionData._id.toString(),
            seller_email: auctionData.seller_email,
            lot_number: lotInformation.lot_number,
            lot_id: lotInformation._id,
            buyer_id: lotInformation.winning_user,
            lot_image: lotInformation.images[0].url,
            email_address: lotInformation.email_address || '',
            bid_amount: lotInformation.bid_amount,
            percentage: auctionData.percentage,
            lot_title: lotInformation.title1,
            lot_title2: lotInformation.title2,
            currency: auctionData.currency,
            name: lotInformation.first_name || '',
            type: auctionData.add_buyer_fees,
            fees: auctionData.fees,
        }
        const existingDocument = await Cart.findOne({ lot_id: lotInformation._id })
        console.log(existingDocument)
        if (existingDocument) {
            console.log('insidee')
            // If the document exists, update it
            const x = await Cart.updateOne({ lot_id: lotInformation._id }, { $set: cartSchema })
            console.log(x)
        } else {
            console.log('insideee')
            const schema = new Cart(cartSchema)
            const y = await schema.save()
            console.log(y)
        }
        return true
    } catch (err) {
        return err
    }
}

module.exports.getBidders = async (document, Bid) => {
    try {
        console.log(document, Bid)
        // await BidInformation.createIndex({ seller_email: 1, auction_id: 1 })

        // const pipeline = [
        //     {
        //         $match: {
        //             seller_email: document.seller_email,
        //             auction_id: document.auction_id,
        //         },
        //     },
        //     {
        //         $sort: { time_stamp: -1 }, // Sort by timestamp in descending order
        //     },
        //     {
        //         $group: {
        //             _id: '$buyer_id',
        //             uniqueBuyerIds: { $addToSet: '$buyer_id' },
        //             latestRecord: { $first: '$$ROOT' }, // Pick the latest record for each buyer_id
        //         },
        //     },
        //     {
        //         $replaceRoot: { newRoot: '$latestRecord' }, // Replace the root with the latest records
        //     },
        // ]

        // const result = await BidInformation.aggregate(pipeline) // Await the aggregation result
        // return result
        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
            // lot_number: document.lot_number,
            // email_address: document.email_address,
        }

        const result = await Bid.find(query) // Await the aggregation result
        return result
    } catch (err) {
        console.log(err)
        return false
    }
}

module.exports.getBidAmount = async (document, BidInformation) => {
    try {
        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
            lot_number: document.lot_number,
            email_address: document.email_address,
        }

        const result = await BidInformation.findOne(query).sort({ updated_at: -1 }) // Sort by updated_at in descending order
        return result
    } catch (err) {
        console.log(err)
        return false
    }
}


/**
 * Retrieves auction lots based on the provided document information using the Lot model.
 *
 * @param {object} document - The document containing seller email and auction ID information.
 * @param {object} Lot - The model representing lots in the database.
 * @returns {object|boolean} - Returns auction lots based on the document information if successful.
 *                            Returns false if there is an error during the process.
 */
module.exports.getAuctionLots = async (document, Lot) => {
    try {
        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
        }
        const documents = await Lot.find(query).lean()
        return documents
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.getAuctionsLots = async (document, timestamp, Lot) => {
    try {
        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
            end_date: { $gte: timestamp },
        }
        const documents = await Lot.find(query)
        return documents
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.getUser = async (query, User) => {
    try {
        const documents = await User.find(query) // Await the query result
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
        const updateUser = await RegisteredUser.updateOne(query, { $set: update_information })
        return updateUser
    } catch (error) {
        console.log(error)
        return false
    }
}

/**
 * Retrieves the execution ARN data for a specific lot based on the provided lot details and StepFunctionArn model.
 *
 * @param {object} currentLotDetails - The details of the current lot for which the execution ARN is to be retrieved.
 * @param {object} StepFunctionArn - The model representing Step Function ARNs in the database.
 * @returns {object|boolean} - Returns the execution ARN data for the specified lot if successful.
 *                            Returns false if there is an error during the process.
 */
module.exports.getAllExecutionArn = async (auction, StepFunctionArn) => {
    try {
        const query = {
            auction_id: auction.auction_id,
            seller_email: auction.seller_email,
        }
        const documents = await StepFunctionArn.find(query)
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

/**
 * Retrieves the execution ARN data for a specific lot based on the provided lot details and StepFunctionArn model.
 *
 * @param {object} currentLotDetails - The details of the current lot for which the execution ARN is to be retrieved.
 * @param {object} StepFunctionArn - The model representing Step Function ARNs in the database.
 * @returns {object|boolean} - Returns the execution ARN data for the specified lot if successful.
 *                            Returns false if there is an error during the process.
 */
module.exports.singleGetAllExecutionArn = async (auction, StepFunctionArn) => {
    try {
        const query = {
            auction_id: auction.auction_id,
            seller_email: auction.seller_email,
            lot_id: new ObjectId(auction._id),
        }
        const documents = await StepFunctionArn.findOne(query)
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

/**
 * Retrieves the execution ARN data for a specific lot based on the provided lot details and StepFunctionArn model.
 *
 * @param {object} currentLotDetails - The details of the current lot for which the execution ARN is to be retrieved.
 * @param {object} StepFunctionArn - The model representing Step Function ARNs in the database.
 * @returns {object|boolean} - Returns the execution ARN data for the specified lot if successful.
 *                            Returns false if there is an error during the process.
 */
module.exports.getExecutionArn = async (currentLotDetails, StepFunctionArn) => {
    try {
        const lotID = currentLotDetails._id.toString()
        const query = {
            lot_id: lotID, // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        }
        const documents = await StepFunctionArn.findOne(query).lean()
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

/**
 * Updates Step Function ARN data based on the provided ARN data, execution data, and StepFunctionArn model.
 *
 * @param {object} arnData - The ARN data document to be updated.
 * @param {object} data - The execution data containing the updated ARN information.
 * @param {object} StepFunctionArn - The model representing Step Function ARNs in the database.
 * @returns {object|boolean} - Returns the result of the update operation if successful.
 *                            Returns false if there is an error during the process.
 */
// module.exports.updateArn = async (arnData, data, StepFunctionArn) => {
//     try {
//         const update_information = {
//             arn: data.executionArn,
//         }
//         const updateResult = await StepFunctionArn.updateOne(
//             { _id: new ObjectId(arnData._id) },
//             { $set: update_information },
//         )
//         return updateResult
//     } catch (error) {
//         console.log(error)
//         return false
//     }
// }

module.exports.updateArn = async (arnData, data, StepFunctionArn) => {
    try {
        const filter = { _id: new ObjectId(arnData._id) }
        const update = {
            $set: {
                arn: data.executionArn,
            },
        }

        const options = { upsert: true }

        const updateResult = await StepFunctionArn.updateOne(filter, update, options)
        return updateResult
    } catch (error) {
        console.error(error)
        return false
    }
}

/**
 * Updates end date for a single lot based on the provided document information using the Lot model.
 *
 * @param {object} document - The document containing lot ID and end date information.
 * @param {object} Lot - The model representing lots in the database.
 * @returns {object} - Returns the result of the update operation.
 */
module.exports.updateSignleLot = async (document, Lot) => {
    const updateResult = await Lot.updateOne(
        { _id: new ObjectId(document.lot_id) },
        {
            $set: {
                end_date: document.end_date,
            },
        },
    )
    return updateResult
}
