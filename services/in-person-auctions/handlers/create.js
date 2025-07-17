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
const Counter = require('../entities/Counter')
const helpers = require('../lib/helper')


// Define nested object schemas for better validation
const colorSchema = Joi.object({
    background_color: Joi.string().allow('').optional(),
    text_color: Joi.string().allow('').optional(),
}).optional()

const fontSchema = Joi.object({
    hearder_font: Joi.string().allow('').optional(), // Note: keeping the typo "hearder" as it exists in your data
    body_font: Joi.string().allow('').optional(),
}).optional()

// eslint-disable-next-line no-unused-vars
const locationSchema = Joi.object({
    address: Joi.string().allow('').optional(),
    latitude: Joi.string().allow('').optional(),
    longitude: Joi.string().allow('').optional(),
}).optional()

const auctionSchema = Joi.object({
    // Basic auction info
    title: Joi.string().allow(''),
    currency: Joi.string().allow('').optional(),
    auction_image: Joi.string().allow('').optional(),
    description: Joi.string().allow('').optional(),
    auction_type: Joi.string().allow('').optional(),

    // Template and branding
    template_name: Joi.string().allow('').optional(),
    logo_image: Joi.string().allow('').optional(),
    logo_redirection_url: Joi.string().allow('').optional(),

    // Menu and navigation
    menu_links: Joi.array().optional(),

    // Dates and timing
    start_date: Joi.number().allow(null).optional(),
    end_date: Joi.number().allow(null).optional(),
    first_lot_end_date: Joi.number().allow(null).optional(),
    time_zone: Joi.string().allow('').optional(),
    extension_type: Joi.string().allow('').optional(),
    extension_time: Joi.string().allow('').optional(),
    extension_time_between_lots: Joi.string().allow('').optional(),

    // Registration and fees
    registration_type: Joi.string().allow('').optional(),
    add_buyer_fees: Joi.string().allow('').optional(),
    percentage: Joi.string().allow('').optional(),
    fees: Joi.string().allow('').optional(),

    // Location and timezone objects (Mixed type in schema)
    location: Joi.object().optional(),
    start_time_zone: Joi.object().optional(),
    end_time_zone: Joi.object().optional(),

    // Content
    faq: Joi.array().optional(),
    terms_and_condition: Joi.string().allow('').optional(),
    note: Joi.string().allow('').optional(),

    // Settings and toggles
    publish_auction_results: Joi.boolean().optional(),
    show_bidding_history: Joi.boolean().optional(),
    toggle_powered_by_indy: Joi.boolean().optional(),
    make_your_auction_private: Joi.boolean().optional(),
    hide_auction_lots: Joi.boolean().optional(),
    show_bidder_location_in_bidder_history: Joi.boolean().optional(),
    passcode: Joi.string().allow('').optional(),

    // Bidding options
    accept_absentee_bid: Joi.boolean().optional(),
    accept_telephone_bid: Joi.boolean().optional(),

    // Styling
    font: fontSchema,
    buttons: colorSchema,
    header: colorSchema,
    content_area: colorSchema,
    footer: colorSchema,
    paddle: colorSchema,

    // System fields (usually not sent in requests, but might be present)
    auction_id: Joi.string().optional(),
    seller_email: Joi.string().email().optional(),
    seller_name: Joi.string().optional(),
    status: Joi.string().allow('').optional(),
    created_at: Joi.date().optional(),
    updated_at: Joi.date().optional(),
    __v: Joi.number().optional(),
    _id: Joi.object().optional(),
})




let connection = null

module.exports.create_auction = async (event) => {
    // --- Authorization Check ---
    try {
        const { claims } = event.requestContext.authorizer
        if (!claims || !claims['cognito:username']) {
            throw new Error('Unauthorized')
        }
        // You can add group checks here if needed
    } catch (error) {
        return {
            statusCode: 403,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
        }
    }
    // --- End Authorization Check ---

    try {
        if (connection === null || !connection.readyState) {
            connection = await mongoConnection.connect()
        }

        const request_body = JSON.parse(event.body)
        const { error } = auctionSchema.validate(request_body)
        if (error) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: `Validation error: ${error.details.map((x) => x.message).join(', ')}` }),
            }
        }
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
            return {
                statusCode: 201,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Auction created successfully',
                    auctions_id: sequenceNumber,
                    _id: auction._id,
                    title: auction.title,
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
