/* eslint-disable no-undef */
const mongoose = require('mongoose')

const { Schema } = mongoose

const stage = process.env.STAGE

const CartSchema = new Schema({
    auction_id: { type: String, required: true },
    seller_email: { type: String },
    lot_number: { type: Number },
    lot_id: { type: String },
    buyer_id: { type: String },
    lot_image: { type: String },
    email_address: { type: String },
    bid_amount: { type: Number },
    percentage: { type: String },
    lot_title: { type: String },
    lot_title2: { type: String },
    currency: { type: String },
    name: { type: String },
    type: { type: String },
    fees: { type: String },
})

const Cart = mongoose.model(`${stage}-carts`, CartSchema)

module.exports = Cart
