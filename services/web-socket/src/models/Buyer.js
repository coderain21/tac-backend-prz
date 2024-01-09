/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const { Schema } = mongoose

/* This code defines a Mongoose schema for an AdminUser model. The schema specifies the fields and
their data types for an AdminUser document, including first_name, password, last_name,
mobile_number, email_address, roles, is_active, user_type, created_at, updated_at, last_login_at,
and is_first_time_login. The schema also includes some options such as trim, default values, and
required fields. The schema is then used to create a Mongoose model named AdminUser, which can be
used to interact with the corresponding MongoDB collection. */
const BuyerSchema = new Schema({
    email_address: {
        type: String, trim: true,
    },
    first_name: {
        type: String, trim: true,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    last_name: {
        type: String, trim: true,
    },
    password: {
        type: String, trim: true,
    },
    terms_and_condition: {
        type: String, trim: true,
    },
    user_type: {
        type: String,
        trim: true,
    },
    newsletter_notification: {
        type: Boolean, trim: true,
    },
    seller_email: {
        type: String, trim: true,
    },
    token: {
        type: Object, trim: true,
    },
    country_code: {
        type: String, trim: true,
    },
    phone_number: {
        type: String, trim: true,
    },
})

BuyerSchema.plugin(mongoosePaginate)
const buyerManagement = mongoose.model('dev-buyers', BuyerSchema, 'dev-buyers')
module.exports = buyerManagement
