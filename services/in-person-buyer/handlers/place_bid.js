/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-unused-vars */
/* eslint-disable no-lone-blocks */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const { ObjectId } = require('mongodb')
const mongoConnection = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const Lot = require('../entities/Lot')
const Buyer = require('../entities/Buyers')





module.exports.place_bid = async (event) => {
    console.log('event', event)
    
}