/* eslint-disable no-plusplus */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const Joi = require('joi')
const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot') // Added missing import
const Counter = require('../entities/Counter')
const helpers = require('../lib/helper')

let connection = null

module.exports.create_auction = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const request_body = JSON.parse(event.body)
        const email = event.requestContext.authorizer.claims['cognito:username']
        request_body.seller_email = email
        const get_user = await mongoConnection.view(Users, { email_address: email })
        const counter = await Counter.findOneAndUpdate({ seller_email: email, record_type: 'Auctions', status: 'Active' }, { $inc: { starting_sequence: 1 } }, { new: true, upsert: true }).exec()
        const sequenceNumber = `A${helpers.leftPad(counter.starting_sequence, 4)}`
        request_body.auction_id = sequenceNumber
        request_body.seller_name = `${get_user[0].first_name} ${get_user[0].last_name}`
        request_body.first_lot_end_date = request_body.first_lot_end_date ? request_body.first_lot_end_date : request_body.end_date
        const auction = await mongoConnection.save(request_body, Auction)

        if (auction) {
            const update_value = {
                auctions_count: helpers.leftPad(counter.starting_sequence, 1),
            }
            await mongoConnection.updateUsingMongoDB(process.env.MONGO_CLIENT, process.env.MONGODB_NAME, process.env.SELLERS_TABLE, get_user[0]._id, update_value)

            // Create 3 lots with static data
            const createdLots = []
            const staticLotData = [
                {
                    images: ['DomainName/BDD/panting2.jpg'],
                    title1: 'Lot 1 - Vintage Ceramic Vase',
                    description: '<p>Beautiful hand-painted ceramic vase from the 19th century</p>',
                    reserve: 150,
                    starting_price: 100,
                    low_estimate: 0,
                    high_estimate: 0,
                    shipping_details: '',
                    current_bid: 0,
                    tags: [],
                },
                {
                    images: ['DomainName/BDD/panting2.jpg'],
                    title1: 'Lot 2 - Antique Pocket Watch',
                    description: '<p>Swiss-made pocket watch from 1920s. Gold-plated case</p>',
                    reserve: 300,
                    starting_price: 200,
                    low_estimate: 0,
                    high_estimate: 0,
                    shipping_details: '',
                    current_bid: 0,
                    tags: [],
                },
                {
                    images: ['DomainName/BDD/panting2.jpg'],
                    title1: 'Lot 3 - Oil Painting Landscape',
                    description: '<p>Original oil painting depicting countryside landscape</p>',
                    reserve: 250,
                    starting_price: 150,
                    low_estimate: 0,
                    high_estimate: 0,
                    shipping_details: '',
                    current_bid: 0,
                    tags: [],
                },
            ]

            for (let i = 0; i < 3; i++) {
                try {
                    // Get lot counter for this auction - same logic as your original create_lot
                    const existingLotCount = await Counter.findOneAndUpdate({
                        seller_email: email, auction_id: sequenceNumber, record_type: 'Lots',
                    }, { $inc: { starting_sequence: 1 } }, { new: true, upsert: true }).exec()

                    const lotNumber = existingLotCount ? existingLotCount.starting_sequence : 1

                    // Create lot data with your original structure
                    const lotData = {
                        ...staticLotData[i],
                        lot_number: lotNumber,
                        seller_email: email,
                        auction_id: sequenceNumber,
                    }

                    // Save lot using your original method
                    const lot = await mongoConnection.save(lotData, Lot)

                    if (lot) {
                        createdLots.push({
                            lot_number: lotNumber,
                            title: lotData.title1,
                            _id: lot._id,
                        })
                    }
                } catch (lotError) {
                    console.log(`Error creating lot ${i + 1}:`, lotError)
                }
            }

            // Update auction with total lots - same logic as your original create_lot
            const auctionRecord = await mongoConnection.view(Auction, { seller_email: email, auction_id: sequenceNumber })
            const auctionUpdateData = {}
            if (auctionRecord[0] && typeof auctionRecord[0].total_lots === 'number') {
                auctionUpdateData.$set = { total_lots: createdLots.length }
            } else {
                auctionUpdateData.$set = { total_lots: createdLots.length }
            }

            if (auctionRecord[0].template_name === 'Single Lot' && createdLots.length > 0) {
                auctionUpdateData.$set.auction_image = [staticLotData[0].images[0]]
            }

            await mongoConnection.UpdateAuction(Auction, { seller_email: email, auction_id: sequenceNumber }, auctionUpdateData)

            return {
                statusCode: 201,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Auction created successfully',
                    auctions_id: sequenceNumber,
                    _id: auction._id,
                    title: auction.title,
                    lots_created: createdLots.length,
                    lots: createdLots,
                }),
            }
        }
        return {
            statusCode: 400,
            headers: await helpers.getHeaders(),
            message: 'Something went wrong. Please try again!',
        }
    } catch (error) {
        console.log('err', error)
        return {
            headers: await helpers.getHeaders(),
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        }
    }
}
