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
const CustomerCodeSchema = new Schema({
    email: { type: String, trim: true, required: true },
    password:{ type: String, trim: true, required: true },
    terms_and_conditions: { type: Boolean , required: true},
    newsletter: { type: Boolean },
    recaptcha_token: { type: String },
    kyc_status: { type: String },
    kyb_status: { type: String },
    first_name: { type: String },
    last_name: { type: String },
    brand_name: { type: String },
    business_registration_number: { type: String },
    website: { type: String },
    address1: { type: String },
    address2: { type: String },
    city: { type: String },
    postal_code: { type: String },
    country: { type: String },
    phone_number: { type: String },
    country_code: { type: String },
    dob: { type: String },
    about: { type: String },
    external_user_id: { type: String },
    applicant_id: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    user_type: { type: String },
    is_first_time_login: { type: Boolean, default: true, required: true },
})

CustomerCodeSchema.plugin(mongoosePaginate)
const CustomerData = mongoose.model(`${stage}-Users`, CustomerCodeSchema)
module.exports = CustomerData

