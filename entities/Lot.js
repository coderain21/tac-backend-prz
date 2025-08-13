/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const stage = process.env.STAGE

const { Schema } = mongoose

/* This code defines a Mongoose schema for an AdminUser model. The schema specifies the fields and
their data types for an AdminUser document, including first_name, password, last_name,
mobile_number, email_address, roles, is_active, user_type, created_at, updated_at, last_login_at,
and is_first_time_login. The schema also includes some options such as trim, default values, and
required fields. The schema is then used to create a Mongoose model named AdminUser, which can be
used to interact with the corresponding MongoDB collection. */
const LotSchema = new Schema({
    title1: {
        type: String, trim: true,
    },
    title2: {
        type: String, trim: true,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    description: {
        type: String, trim: true,
    },
    starting_price: {
        type: Number, trim: true,
    },
    low_estimate: {
        type: Number, trim: true,
    },
    high_estimate: {
        type: Number, trim: true,
    },
    shipping_details: {
        type: String,
        trim: true,
    },
    tags: {
        type: Array,
        trim: true,
    },
    auction_id: {
        type: String,
        trim: true,
    },
    seller_email: {
        type: String,
        trim: true,
    },
    starting_bid: {
        type: Number,
    },
    start_date: {
        type: Number,
    },
    end_date: {
        type: Number,

    },
    current_bid: {
        type: Number,
    },
    top_bidder: {
        type: String, trim: true,
    },
    images: {
        type: Array, trim: true,
    },
    lot_number: {
        type: Number, trim: true,

    },
    bidder_name: {
        type: String, trim: true,
    },
    paddle_number: {
        type: Number,
    },
    winning_user: {
        type: String, trim: true,
    },
    reserve: {
        type: Number, trim: true,
    },
    number_of_absentee_bids: {
        type: Number,
    },
    number_of_telephone_bids: {
        type: Number,
    },
})

LotSchema.plugin(mongoosePaginate)
const lotManagement = mongoose.model(`${stage}-lots`, LotSchema, `${stage}-lots`)
module.exports = lotManagement
