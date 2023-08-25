/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const { Schema } = mongoose
const stage = process.env.STAGE

const auctionDateSchema = new mongoose.Schema({
    start_date: {
        type: String,
        required: true,
        trim: true,
    },
    start_time: {
        type: String,
        required: true,
        trim: true,
    },
    end_date: {
        type: String,
        required: true,
        trim: true,
    },
    end_time: {
        type: String,
        required: true,
        trim: true,
    },
})
const auctionDetailsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    auction_image: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
    currency: {
        type: String,
        required: true,
        trim: true,
    },
})

const fontDetailsSchema = new mongoose.Schema({
    hearder_font: {
        type: String,
        required: true,
        trim: true,
    },
    body_font: {
        type: String,
        required: true,
        trim: true,
    },
})

const commaonSchema = new mongoose.Schema({
    background_color: {
        type: String,
        required: true,
        trim: true,
    },
    text_color: {
        type: String,
        required: true,
        trim: true,
    },
})

/* This code defines a Mongoose schema for an AdminUser model. The schema specifies the fields and
their data types for an AdminUser document, including first_name, password, last_name,
mobile_number, email_address, roles, is_active, user_type, created_at, updated_at, last_login_at,
and is_first_time_login. The schema also includes some options such as trim, default values, and
required fields. The schema is then used to create a Mongoose model named AdminUser, which can be
used to interact with the corresponding MongoDB collection. */
const AuctionSchema = new Schema({
    user_type: {
        type: String, trim: true, required: true,
    },
    auction_id: {
        type: String, trim: true, required: true,
    },
    seller_email: {
        type: String, trim: true, required: true,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    template_name: {
        type: String, trim: true, required: true,
    },
    menu_links: {
        type: Array, trim: true, required: true,
    },
    logo_image: {
        type: String, trim: true, required: true,
    },
    logo_redirection_url: {
        type: String, trim: true, required: true,
    },
    details: {
        type: auctionDetailsSchema,
        required: true,
    },
    auction_date: {
        type: auctionDateSchema,
        required: true,
    },
    extension_type: {
        type: String, trim: true, required: true,
    },
    extension_time: {
        type: String, trim: true, required: true,
    },
    registration_type: {
        type: String, trim: true, required: true,
    },
    add_buyer_fees: {
        type: String, trim: true, required: true,
    },
    faq: {
        type: Array, trim: true, required: true,
    },
    time_zone: {
        type: String, trim: true, required: true,
    },
    terms_and_condition: {
        type: String, trim: true, required: true,
    },
    publish_auction_results: {
        type: Boolean, trim: true, required: true,
    },
    show_bidder_location_in_bidder_history: {
        type: Boolean, trim: true, required: true,
    },
    make_your_auction_private: {
        type: Boolean, trim: true, required: true,
    },
    passcode: {
        type: String, trim: true, required: true,
    },
    font: {
        type: fontDetailsSchema,
        required: true,
    },
    buttons: {
        type: commaonSchema,
        required: true,

    },
    header: {
        type: commaonSchema,
        required: true,

    },
    content_area: {
        type: commaonSchema,
        required: true,

    },
    footer: {
        type: commaonSchema,
        required: true,

    },
    paddle: {
        type: commaonSchema,
        required: true,

    },
})

HistorySchema.plugin(mongoosePaginate)
const auctionManagement = mongoose.model(`${stage}-auction-management`, AuctionSchema, `${stage}-auction-management`)
module.exports = auctionManagement
