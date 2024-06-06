/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-console */

const mongodbHelper = require('../lib/mongodb_helper')
const Auction = require('../entities/Auction')
const Wishlist = require('../entities/Wishlist')
const AccessLogs = require('../entities/AccessLogs')
const helpers = require('../lib/helper')
const Users = require('../entities/Users')
const cognitoHelper = require('../lib/cognito-helper')

/**
 * The function which disable and enable the seller
 * @param body - {object}
 * @returns {Object} (201) - Updated Successfully
 * @returns {Error} (500) - There was an error while updating seller status
 */

let connection = null

module.exports.handler = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            console.log('not coonected')
            connection = await mongodbHelper.connect()
        }
        const payload = JSON.parse(event.body)
        console.log('payload', payload)
        const emailAddress = event.requestContext.authorizer.claims['cognito:username']
        // chnage status in the documentDB
        const query = { seller_email: payload.section.user_id }
        const Status = payload.status === 'Active' ? 'adminEnableUser' : 'adminDisableUser'
        const updateInformation = {
            status: payload.status,
        }
        const updateStatus = mongodbHelper.commonUpdate(Users, query, updateInformation)
        console.log('updateStatus', updateStatus)

        // change the status in the cognito document
        const cognitoUpdate = cognitoHelper.activateDeactivateUser(payload.section_details.user_id, Status, process.env.SELLER_COGNITO_USERPOOL_ID)
        console.log('cognitoUpdate', cognitoUpdate)

        const updaterDetails = {
            name: payload.name,
            email_address: emailAddress,
        }
        console.log('updaterDetails:', updaterDetails)

        // If Deactivate, then get all auctions realted to the seller which is in the "Accepting bid state/ Published state"
        // Cancel all the auction which is the "Accepting bid state/ Published state
        const findAndUpdate = await mongodbHelper.cancelAuctions(payload.seller_email, Auction)
        console.log('findAndUpdate', findAndUpdate)

        // remove the cancelled the auction in the wishlist screen
        const deleteWishlistAuctions = await mongodbHelper.deleteWishlistedAuction(payload.seller_email, Wishlist)
        console.log('deleteWishlistAuctions', deleteWishlistAuctions)

        // save the access logs after enable/disbale the seller
        const schemaConstructor = {
            actor_id: payload.actor_id === undefined ? 'IA001' : payload.actor_id,
            updated_by: payload.updated_by,
            section: payload.section_details,
        }
        const saveLogs = await mongodbHelper.save(schemaConstructor, AccessLogs)
        console.log('saveLogs', saveLogs)
        // lots needs to be end of particular auctions
        return {
            statusCode: 201,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: `Seller  ${payload.status} successfully`,
            }),
        }
    } catch (error) {
        console.log(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: error.message }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
