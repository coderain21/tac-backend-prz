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
const ARNSchema = new Schema({
    arn: {
        type: String, trim: true,
    },
    lot_id: {
        type: String, trim: true,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    auction_id: {
        type: String, trim: true,
    },
    seller_email: {
        type: String, trim: true,
    },
    status: {
        type: String, trim: true,
    },
})

ARNSchema.plugin(mongoosePaginate)
const ARNSchemaManagement = mongoose.model(`${stage}-step-function-arns`, ARNSchema, `${stage}-step-function-arns`)
module.exports = ARNSchemaManagement
