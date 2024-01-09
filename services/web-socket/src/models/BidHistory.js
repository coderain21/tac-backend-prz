/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const { Schema } = mongoose
const stage = 'dev'

/* This code defines a Mongoose schema for an AdminUser model. The schema specifies the fields and
their data types for an AdminUser document, including first_name, password, last_name,
mobile_number, email_address, roles, is_active, user_type, created_at, updated_at, last_login_at,
and is_first_time_login. The schema also includes some options such as trim, default values, and
required fields. The schema is then used to create a Mongoose model named AdminUser, which can be
used to interact with the corresponding MongoDB collection. */

const BidSchema = new Schema({
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
        type: String, trim: true,
    },
    starting_bid: {
        type: Number, trim: true,
    },
    bid_amount: {
        type: Number,
        trim: true,
    },
    lot_id: {
        type: String,
        trim: true,
    },
    low_estimate: {
        type: String,
        trim: true,
    },
    high_estimate: {
        type: String,
        trim: true,
    },
    bid_status: {
        type: String,
        trim: true,
    },
    start_date: {
        type: Number,
    },
    end_date: {
        type: Number,
    },
    timestamp: {
        type: Number,
    },
    max_bid: {
        type: Number,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },

})

BidSchema.plugin(mongoosePaginate)
const bidManagement = mongoose.model(`${stage}-bid-information`, BidSchema, `${stage}-bid-information`)
module.exports = bidManagement
