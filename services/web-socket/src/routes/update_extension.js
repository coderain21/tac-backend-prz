/* eslint-disable no-console */
/* eslint-disable consistent-return */
/* eslint-disable no-prototype-builtins */
/* eslint-disable no-param-reassign */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-empty */
const mongodbHelper = require('../utilities/mongodb_helper')
const Auction = require('../models/Auction')
const Lot = require('../models/Lot')

module.exports.checkExtensionType = async (documents) => {
    try {
        console.log('checkExtensionType', documents)
        const getAuctionDetails = await mongodbHelper.getAuction(documents, Auction)
        console.log('getAuctionDetails1234', getAuctionDetails)
        await mongodbHelper.getAllLots(getAuctionDetails[0], documents, Lot)
        return false
    } catch (err) {
        return err
    }
}

module.exports.extensionAlert = async (socket, data, io) => {
    console.log('enteringggg alret')
    const lotID = data.lot_id.toString()
    console.log('lot id extesnion triggered', lotID, typeof data.lot_id)
    try {
        io.to(lotID).emit('extensionAlert', {
            success: true,
            extension: {
                extended: true, extended_time: data.extended_time, lot_id: data.lot_id, extension_type: data.extension_type,
            },
        })
    } catch (err) {
        console.log('errrrrrrrrrrrrrrrrrrrrr', err)
        return err
    }
}
