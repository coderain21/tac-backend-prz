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
    unique_id: {
        type: String, trim: true, required: true, unique: true,
    },
    user_type: { type: String, trim: true, required: true },
    password: { type: String, trim: true, required: true },
    email_address: { type: String, trim: true, unique: true },
    status: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    is_first_time_login: { type: Boolean, default: true, required: true },
    newsletter_notification: { type: Boolean, default: false },
    terms_and_condition: { type: Boolean, default: false },
    free_user: { type: Boolean, default: true },
})

UserSchema.plugin(mongoosePaginate)
const Users = mongoose.model(`${stage}-users`, UserSchema)
module.exports = Users
