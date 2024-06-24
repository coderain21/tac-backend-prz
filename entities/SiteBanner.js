/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const stage = process.env.STAGE

const { Schema } = mongoose

const NotificationSchema = new Schema({
    type: { type: String,required: true },
    audience: { type: String, required: true},
    notification: { type: String, maxlength: 2000 },
    created_at: { type: Number, default: () => Date.now() },
    updated_at: { type: Number, default: () => Date.now() },
})

// Create a compound unique index on type and audience
NotificationSchema.index({ type: 1, audience: 1 }, { unique: true })

NotificationSchema.plugin(mongoosePaginate)
const SiteBanner = mongoose.model(`${stage}-site-banner-notification`, NotificationSchema, `${stage}-site-banner-notification`)

module.exports = SiteBanner
