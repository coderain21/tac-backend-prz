/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const { Schema } = mongoose
const stage = process.env.STAGE

const LiveBidSchema = new Schema({
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
        type: Number,
    },
    bid_amount: {
        type: Number,
        trim: true,
    },
    lot_id: {
        type: String,
        trim: true,
    },
    lot_number: {
        type: Number,
    },
    timestamp: {
        type: Number,
    },
    max_bid: {
        type: Number,
    },
    email_address: { type: String },
    country_code: { type: String },
    phone_number: { type: String },
    name: { type: String },
    bid_type: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Number },

})

LiveBidSchema.plugin(mongoosePaginate)
const liveBidManagement = mongoose.model(`${stage}-live-bids`, LiveBidSchema, `${stage}-live-bids`)
module.exports = liveBidManagement
