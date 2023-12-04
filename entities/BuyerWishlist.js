const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const { Schema } = mongoose
const stage = process.env.STAGE
const buyerWishlistSchema = new Schema({
    lot_id: { type: String, required: true },
    seller_email: { type: String, required: true },
    buyer_email: { type: String, required: true },
})
buyerWishlistSchema.plugin(mongoosePaginate)
const buyerWishlist = mongoose.model(`${stage}-buyer-wishlist`, buyerWishlistSchema)
module.exports = buyerWishlist
