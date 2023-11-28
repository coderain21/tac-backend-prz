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
