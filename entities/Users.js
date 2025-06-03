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
    user_type: {
        type: String, trim: true, required: true,
    },
    seller_id: { type: String, trim: true },
    user_name: { type: String, trim: true },
    password: { type: String, trim: true, required: true },
    email_address: { type: String, trim: true },
    status: { type: String, default: 'Active' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    is_first_time_login: { type: Boolean, default: true },
    newsletter_notification: { type: Boolean, default: false },
    terms_and_condition: { type: Boolean, default: false },
    free_user: { type: Boolean, default: true },
    first_name: { type: String, trim: true, default: '' },
    last_name: { type: String, trim: true, default: '' },
    brand_name: { type: String, trim: true, default: '' },
    business_registration_number: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    address_line_1: { type: String, trim: true, default: '' },
    address_line_2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    postal_code: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    phone_number: { type: String, trim: true, default: '' },
    country_code: { type: String, trim: true, default: '' },
    date_of_birth: { type: String, trim: true, default: '' },
    about: { type: String, trim: true, default: '' },
    facebook_link: { type: String, trim: true, default: '' },
    Instagram_link: { type: String, trim: true, default: '' },
    twitter: { type: String, trim: true, default: '' },
    linkedin_link: { type: String, trim: true, default: '' },
    tiktok_link: { type: String, trim: true, default: '' },
    kyb_status: { type: String, trim: true, default: false },
    // seller_id: { type: String, trim: true, default: '' }, // Removed duplicate key
    full_name: { type: String, trim: true, default: '' },
    plan_type: { type: String, trim: true, default: '' }, // Added spaces
    privacy_policy: { type: String, trim: true, default: '' },
    policy_updated_at: { type: Date },
    marketing_opt_in: { type: String, default: '', trim: true },
    marketing_opt_in_updated_at: { type: Date },
})

UserSchema.plugin(mongoosePaginate)
const Users = mongoose.model(`${stage}-users`, UserSchema)
module.exports = Users
