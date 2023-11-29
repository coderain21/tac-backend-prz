/* eslint-disable no-prototype-builtins */
/* eslint-disable no-param-reassign */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-empty */
const mongodbHelper = require('../utilities/mongodb_helper')

module.exports.checkExtensionType = async (documents) => {
    try {
        const getAuctionDetails = await mongodbHelper.getAuction(documents)
        console.log('getAuctionDetails', getAuctionDetails)
        await mongodbHelper.getAllLots(getAuctionDetails[0], documents)
        return false
    } catch (err) {
        return err
    }
}


module.exports.extensionAlert = async (socket, lotID, io) => {
    console.log('#####################')
    io.to('6565942ca4a8aa45423f1e82').emit('extensionAlert', {
        success: true,
    })  
}