/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const stage = process.env.STAGE

const { Schema } = mongoose

const NotificationSchema = new Schema({
    type: { type: String, unique: true, required: true },
    audience: { type: String },
    notification: { type: String, maxlength: 2000 },
    created_at: { type: Number, default: () => Date.now() },
    updated_at: { type: Number, default: () => Date.now() },
})

NotificationSchema.plugin(mongoosePaginate)
const SiteBanner = mongoose.model(`${stage}-site-banner-notification`, NotificationSchema, `${stage}-site-banner-notification`)

module.exports = SiteBanner
