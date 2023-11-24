/* eslint-disable no-empty */
const mongodbHelper = require('../utilities/mongodb_helper')

module.exports.checkExtensionType = async (documents) => {
    try {
        const getAuctionDetails = await mongodbHelper.getAuction(documents)
        console.log('getAuctionDetails', getAuctionDetails)
        // const currentDate = new Date()
        // const oneMinuteBeforeEndDate = new Date(currentDate.getTime() - (60 * 1000))
        // const endDate = new Date(getAuctionDetails[0].end_date)
        // if (oneMinuteBeforeEndDate.toISOString() !== endDate.toISOString()) {
        //     await checkExtension(getAuctionDetails[0])
        //     return true
        // }
        await mongodbHelper.getAllLots(getAuctionDetails[0], documents)

        return false
    } catch (err) {
        // Handle errors
        return err
    }
}
