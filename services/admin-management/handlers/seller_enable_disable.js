/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-console */

/**
 * The function which disable and enable the seller
 * @param body - {object}
 * @returns {Object} (201) - Updated Successfully
 * @returns {Error} (500) - There was an error while updating seller status
 */

module.exports.handler = async (event) => {
    try {
        const payload = JSON.parse(event.body)
        console.log('payload', payload)
        // if (payload.status === 'Activate') {
        //     console.log('Activating')
        // }
        // If Deactivate, then get all auctions realted to the seller which is in the "Accepting bid state/ Published state"
        // Cancel all the auction which is the "Accepting bid state/ Published state
        // remove the cancelled the auction in the wishlist screen
        // save the access logs after enable/disbale the seller
        // lots needs to be end of particular auctions
    } catch (error) {
        console.log(error)
        // return {
        //     statusCode: 500,
        //     headers: await helpers.getHeaders(),
        //     body: JSON.stringify({ message: error.message }),
        // }
    }
}
