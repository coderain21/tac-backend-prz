/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const { Schema } = mongoose
const stage = process.env.STAGE

const fontDetailsSchema = new mongoose.Schema({
    hearder_font: {
        type: String,
        trim: true,
    },
    body_font: {
        type: String,
        trim: true,
    },
})

const commonSchema = new mongoose.Schema({
    background_color: {
        type: String,
    },
    text_color: {
        type: String,
    },
})

/* This code defines a Mongoose schema for an AdminUser model. The schema specifies the fields and
their data types for an AdminUser document, including first_name, password, last_name,
mobile_number, email_address, roles, is_active, user_type, created_at, updated_at, last_login_at,
and is_first_time_login. The schema also includes some options such as trim, default values, and
required fields. The schema is then used to create a Mongoose model named AdminUser, which can be
used to interact with the corresponding MongoDB collection. */
const AuctionSchema = new Schema({
    auction_id: {
        type: String, trim: true,
    },
    seller_email: {
        type: String, trim: true, default: '',
    },
    seller_name: { type: String, trim: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    template_name: {
        type: String, trim: true,
    },
    menu_links: {
        type: Array, trim: true,
    },
    logo_image: {
        type: String, trim: true,
    },
    logo_redirection_url: {
        type: String, trim: true,
    },
    title: {
        type: String,
        trim: true,
    },
    auction_image: {
        type: Schema.Types.Mixed,
        default: '',
    },
    description: {
        type: String,
        trim: true,
    },
    currency: {
        type: String,
        trim: true,
    },
    start_date: {
        type: Number,
    },
    end_date: {
        type: Number,
    },
    first_lot_end_date: {
        type: Number,
    },
    extension_type: {
        type: String, trim: true,
    },
    extension_time: {
        type: String, trim: true,
    },
    extension_time_between_lots: {
        type: String, trim: true,

    },
    registration_type: {
        type: String, trim: true,
    },
    add_buyer_fees: {
        type: String, trim: true,
    },
    faq: {
        type: Array, trim: true,
    },
    time_zone: {
        type: String, trim: true,
    },
    terms_and_condition: {
        type: String, trim: true,
    },
    publish_auction_results: {
        type: Boolean, trim: true,
    },
    show_bidding_history: {
        type: Boolean, trim: true,
    },
    toggle_powered_by_indy: {
        type: Boolean, trim: true,
    },
    hide_auction_lots: {
        type: Boolean, trim: true,
    },
    show_bidder_location_in_bidder_history: {
        type: Boolean, trim: true,
    },
    make_your_auction_private: {
        type: Boolean, trim: true,
    },
    passcode: {
        type: String, trim: true,
    },
    font: {
        type: fontDetailsSchema,
    },
    buttons: {
        type: commonSchema,

    },
    header: {
        type: commonSchema,

    },
    content_area: {
        type: commonSchema,

    },
    footer: {
        type: commonSchema,

    },
    paddle: {
        type: commonSchema,

    },
    note: {
        type: String, trim: true,
    },
    status: {
        type: String, trim: true, default: 'Draft',
    },
    percentage: {
        type: String, trim: true,
    },
    fees: {
        type: String, trim: true, default: '',
    },
    location: {
        type: Schema.Types.Mixed,
        default: {},
    },
    start_time_zone: {
        type: Schema.Types.Mixed,
        default: {},
    },
    end_time_zone: {
        type: Schema.Types.Mixed,
        default: {},
    },
    accept_absentee_bids: {
        type: Boolean,
        default: false,
    },
    accept_telephone_bids: {
        type: Boolean,
        default: false,
    },
    auction_type: {
        type: String,
        trim: true,
        default: '',
    },
})

AuctionSchema.plugin(mongoosePaginate)
const auctionManagement = mongoose.model(`${stage}-auctions`, AuctionSchema, `${stage}-auctions`)
module.exports = auctionManagement
