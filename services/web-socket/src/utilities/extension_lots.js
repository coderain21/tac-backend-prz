/* eslint-disable no-empty */
const mongodbHelper = require('./mongodb_helper')

async function checkExtension(docs) {
    try {
        if (docs.extension_type === 'All Lots') {
            await mongodbHelper.getAllLots(docs)
        } else if (docs.extension_type === 'Cascade') {
            await mongodbHelper.updateLots(docs)
        } else {
            // cascaded
        }
        return true
    } catch (err) {
        return err
    }
}

module.exports.checkExtensionType = async (auction, lotID) => {
    try {
        // Sample auction data

        // Get current time
        const currentTime = new Date()
        // Check if auction end time is less than current time minus one minute
        if (auction.endDateTime.getTime() < currentTime.getTime() - 60 * 1000) {
            // Apply extension logic based on extension type
            switch (auction.end_date) {
            case 'cascade':
                auction.lots.forEach((lot, index) => {
                    // Calculate new end datetime for each lot
                    lot.end_date = new Date(auction.endDateTime.getTime() + index * auction.extensionTime)
                })
                break
            case 'all lots':
                // Set the same extension time for all lots
                const newEndDateTime = new Date(auction.end_date.getTime() + auction.extension_time)
                auction.lots.forEach((lot) => {
                    lot.end_date = newEndDateTime
                })
                break
            case 'individual':
                // Set extension time for a specific lot (e.g., lot1)
                auction.lots.find((lot) => lot.name === lotID).end_date = new Date(auction.endDateTime.getTime() + auction.extensionTime)
                break
            default:
                console.log('Unknown extension type')
            }

            // Display updated auction data
            console.log('Updated Auction:', auction)
        } else {
            console.log('Auction has not ended or does not require extension.')
        }
    } catch (err) {
        // Handle errors
        return err
    }
}
