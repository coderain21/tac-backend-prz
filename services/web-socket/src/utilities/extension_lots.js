/* eslint-disable no-empty */
const mongodbHelper = require('./mongodb_helper')

async function checkExtension(docs) {
    try {
        if (docs.extension_type === 'All Lots') {
            const allLots = mongodbHelper.getAllLots(docs)
        } else if (docs.extension_type === 'Individual Lots') {

        }
    } catch (err) {
        return err
    }
}
module.exports.checkExtensionType = async (documents) => {
    try {
        const getAuctionDetails = await mongodbHelper.getAuction(documents)
        const currentDate = new Date()
        const isEnded = false
        const oneMinuteBeforeEndDate = new Date(currentDate.getTime() - (60 * 1000))
        const endDate = new Date(getAuctionDetails[0].end_date)
        if (oneMinuteBeforeEndDate.getTime() === endDate.getTime()) {
            const updateLots = await checkExtension(getAuctionDetails)
        } else {

        }
    } catch (err) {

    }
}
