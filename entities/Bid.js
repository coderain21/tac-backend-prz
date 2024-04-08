/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const { Schema } = mongoose
const stage = process.env.STAGE

/* This code defines a Mongoose schema for an AdminUser model. The schema specifies the fields and
their data types for an AdminUser document, including first_name, password, last_name,
mobile_number, email_address, roles, is_active, user_type, created_at, updated_at, last_login_at,
and is_first_time_login. The schema also includes some options such as trim, default values, and
required fields. The schema is then used to create a Mongoose model named AdminUser, which can be
used to interact with the corresponding MongoDB collection. */

const UniqueBidSchema = new Schema({
    auction_id: {
        type: String, trim: true,
    },
    seller_email: {
        type: String, trim: true,
    },
    buyer_id: {
        type: String, trim: true,
    },
    paddle_number: {
        type: Number
    },
    bid_amount: {
        type: Number,
        trim: true,
    },
    lot_id: {
        type: String,
        trim: true,
    },
    timestamp: {
        type: Number,
    },
    max_bid: {
        type: Number,
    },
    email_address: { type: String },
    name: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Number },

})

UniqueBidSchema.plugin(mongoosePaginate)
const uniqueBidManagement = mongoose.model(`${stage}-unique-bids`, UniqueBidSchema, `${stage}-unique-bids`)
module.exports = uniqueBidManagement
