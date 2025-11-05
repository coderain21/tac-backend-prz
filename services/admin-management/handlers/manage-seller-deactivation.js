/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
const mongodbHelper = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const Wishlist = require('../entities/Wishlist')
// const AccessLogs = require('../entities/AccessLogs')

let connection = null

/**
 * The function will trigger after deactivating the seller from the application
 * It Cancel all the auction which is in 'Accepting Bid' and 'Published' state
 * It delete the lots which is in 'Accepting Bid' and 'Published' state
 * Saving access logs for the future use.
 * @param body - {object}
 * @returns {Object} (201) - Updated Successfully
 * @returns {Error} (500) - There was an error while updating seller status
 */

module.exports.handler = async (event) => {
    try {
        console.log('event', event)
        if (connection === null || !connection.readyState) {
            console.log('not coonected')
            connection = await mongodbHelper.connect()
        }
        const sellerEmail = event.section.user_id
        // Cancel the all the auctions that belongs to the deactivated user
        const findAndUpdate = await mongodbHelper.cancelAuctions(sellerEmail, Auction)
        console.log(findAndUpdate)

        // remove the cancelled the auction in the wishlist screen
        const deleteWishlistAuctions = await mongodbHelper.deleteWishlistedAuction(sellerEmail, Wishlist)
        console.log(deleteWishlistAuctions)

        // await mongodbHelper.save(event, AccessLogs)
        return true
    } catch (err) {
        console.log('Error', err)
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
