/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
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
const WishlistSchema = new Schema({
    seller_email: {
        type: String, trim: true,
    },
    lot_id: { type: String, trim: true },
    buyer_id: { type: String, trim: true, required: true },
    email_address: { type: String, trim: true },
    auction_name: { type: String, default: 'Active' },
    auction_id: { type: Boolean, default: true },
    auction_uid: { type: Boolean, default: false },
})

WishlistSchema.plugin(mongoosePaginate)
const Wishlist = mongoose.model(`${stage}-buyer-wishlists`, WishlistSchema)
module.exports = Wishlist
