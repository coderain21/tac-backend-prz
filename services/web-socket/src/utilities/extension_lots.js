/* eslint-disable no-empty */
const mongodbHelper = require('./mongodb_helper')

async function checkExtension(docs) {
    try {
        if (docs.extension_type === 'All Lots') {
            const allLots = await mongodbHelper.getAllLots(docs)
            console.log('allLots', allLots)
        } else if (docs.extension_type === 'Individual Lots') {
            const allLots = await mongodbHelper.updateLots(docs)
        }
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
            const updateLots = await checkExtension(getAuctionDetails[0])
        } else {
            // Your else block
        }
    } catch (err) {
        // Handle errors
    }
}
