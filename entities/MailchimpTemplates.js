/* eslint-disable no-undef */
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
require('dotenv').config()

const stage = process.env.STAGE
const { Schema } = mongoose

/* This code defines a Mongoose schema for an Seller model.. */
const TemplateSchema = new Schema({
    name: {
        type: String, trim: true,
    },
    seller_email: {
        type: String, trim: true,
    },
    seller_id: { type: String, trim: true },
    slug: { type: String, trim: true },

})

TemplateSchema.plugin(mongoosePaginate)
const MailchimpTemplates = mongoose.model(`${stage}-mailchimp-templates`, TemplateSchema, `${stage}-mailchimp-templates`)
module.exports = MailchimpTemplates
