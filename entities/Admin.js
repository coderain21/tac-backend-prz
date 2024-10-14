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
const AdminSchema = new Schema({
    email_address: {
        type: String, trim: true,
    },
    user_id: {
        type: String, trim: true,
    },
    first_name: {
        type: String, trim: true,
    },
    last_name: {
        type: String, trim: true,
    },
    updated_at: { type: Number, default: () => Date.now() },
    created_at: { type: Number, default: () => Date.now() },

})

AdminSchema.plugin(mongoosePaginate)
const Admin = mongoose.model(`${stage}-admin-users`, AdminSchema)
module.exports = Admin
