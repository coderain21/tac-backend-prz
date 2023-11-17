/* eslint-disable no-empty */
const mongodbHelper = require('./mongodb_helper')

async function checkExtension(docs) {
    try {
        if (docs.extension_type === 'All Lots') {
            await mongodbHelper.getAllLots(docs)
        } else if (docs.extension_type === 'Individual') {
            await mongodbHelper.updateLots(docs)
        } else {
            // cascaded
        }
        return true
    } catch (err) {
        return err
    }
}

module.exports.checkExtensionType = async (documents) => {
    try {
        const getAuctionDetails = await mongodbHelper.getAuction(documents)
        const currentDate = new Date()
        const oneMinuteBeforeEndDate = new Date(currentDate.getTime() - (60 * 1000))
        const endDate = new Date(getAuctionDetails[0].end_date)
        if (oneMinuteBeforeEndDate.toISOString() !== endDate.toISOString()) {
            await checkExtension(getAuctionDetails[0])
            return true
        }
        return false
    } catch (err) {
        // Handle errors
        return err
    }
}
