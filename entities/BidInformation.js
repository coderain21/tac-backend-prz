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
const UserSchema = new Schema({
    user_name: {
        type: String, trim: true, required: true,
    },
    auction_id: { type: String, trim: true, required: true },
    starting_bid_amunt: { type: String, trim: true },
    current_bid_amount: { type: Boolean, default: false },
    first_name: { type: String, trim: true, default: '' },
    last_name: { type: String, trim: true, default: '' },
})

UserSchema.plugin(mongoosePaginate)
const bidsManagement = mongoose.model(`${stage}-bid-information`, UserSchema, `${stage}-bid-information`)
module.exports = bidsManagement
