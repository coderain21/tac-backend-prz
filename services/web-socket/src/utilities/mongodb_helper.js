/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-self-import */
/* eslint-disable camelcase */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
const mongoose = require('mongoose')
const { ObjectId } = require('mongodb')
const Buyer = require('../models/Buyer')
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
// module.exports.updateTopBidder = async (updateInformation) => {
//     try {
//         const client = await this.connect()
//         const database = client.connection.db // Access the database
//         const collection = database.collection('dev-lots') //
//         const updateResult = await collection.updateOne(
//             { _id: new ObjectId(data.lot_id) },
//             {
//                 $set: {
//                     Top_bidder: updateInformation.buyer_id, paddle_number: updateInformation.paddle_number, current_bid: updateInformation.bid_amount,
//                 },
//             },
//         )
//         client.disconnect()
//         return updateResult
//     } catch (error) {
//         return error
//     }
// }

module.exports.getAuction = async (document, Auction) => {
    try {
        const query = {
            seller_email: document.seller_email, auction_id: document.auction_id, // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        } // Corrected 'document.buyer_id'
        console.log('getauction222', query)
        const documents = await Auction.find(query) // Await the query result
        console.log('!!!!!!', documents)
        return documents
    } catch (err) {
        console.log('errorrr', err)
        return false
    }
}
module.exports.getLot = async (lot_id, Lot) => {
    try {
        const query = {
            _id: ObjectId(lot_id), // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        } // Corrected 'document.buyer_id'
        const documents = await Lot.find(query) // Await the query result
        return documents
    } catch (err) {
        console.log(err, 'getoe')
        return false
    }
}

module.exports.getAllLots = async (document, lotData, Lot) => {
    try {
        console.log('getall lot payload', document)
        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
        }
        let documents
        if (document.extension_type === 'All Lots') {
            documents = await Lot.find(query)
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
            const updateQuery = {
                $set: {
                    end_date: newTimestamp,
                    extended_time: document.extension_time,

                },
            }
            await Lot.updateMany({ _id: { $in: documents.map((lot) => ObjectId(lot._id)) } }, updateQuery)
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
            documents = await Lot.find({ ...query, _id: lotId })
            const updateQuery = {
                $set: {
                    end_date: newTimestamp,
                    extended_time: document.extension_time,
                },
            }
            await Lot.updateMany({ _id: lotId }, updateQuery)
        } else {
            const sortOptions = { lot_number: 1 }
            documents = await Lot.find(query).sort(sortOptions).toArray()
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

            await Lot.bulkWrite(bulkOperations, { ordered: false })
        }
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.getAuctionLots = async (document, Lot) => {
    try {
        const query = {
            seller_email: document.seller_email,
            auction_id: document.auction_id,
        }
        const documents = await Lot.find(query)
        return documents
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.getBuyer = async (query, BuyerSchema) => {
    try {
        console.log('buyer schemaa', query)
        const documents = await BuyerSchema.find(query) // Await the query result
        console.log('doccc', documents)
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

module.exports.saveBidHistory = async (document, BidHistory) => {
    try {
        const result = await BidHistory.insertOne(document)
        return result
    } catch (err) {
        return err
    }
}

module.exports.getExecutionArn = async (currentLotDetails, StepFunctionArn) => {
    try {
        const lotID = currentLotDetails._id.toString()
        const query = {
            lot_id: lotID, // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
        }
        const documents = await StepFunctionArn.find(query)// Await the query result
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

module.exports.update = async (arnData, data, StepFunctionArn) => {
    try {
        const update_information = {
            arn: data.executionArn,
        }
        // const connection = await mongoConnection.connect()
        const updateResult = await StepFunctionArn.updateOne(
            { _id: new ObjectId(arnData._id) },
            { $set: update_information },
        )
        return updateResult
        // await connection.disconnect()
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.updateLotDetails = async (document, Lot) => {
    try {
        console.log('######', document)
        const query = {
            _id: new ObjectId(document.winning_user),
            seller_email: document.seller_email,
        }
        const getBuyerInfo = await this.getBuyer(query, Buyer)
        console.log('Getting BUYER IN', getBuyerInfo)
        const updateResult = await Lot.updateOne(
            { _id: new ObjectId(document._id) },
            {
                $set: {
                    starting_bid: document.starting_price, current_bid: document.bid_amount, top_bidder: `${getBuyerInfo[0].first_name} ${getBuyerInfo[0].first_name}`,
                },
            },
        )
        console.log('update', updateResult)
        return updateResult
        // await connection.disconnect()
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.updateAuctionData = async (Auction, user_id, updateInformation) => {
    try {
        const updateResult = await Auction.updateOne(
            { _id: user_id },
            { $set: updateInformation },
        )
        return updateResult
    } catch (error) {
        console.log(error)
        return false
    }
}
