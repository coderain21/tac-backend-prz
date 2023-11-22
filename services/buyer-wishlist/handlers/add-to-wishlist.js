/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
const Joi = require('joi')
const helpers = require('../lib/helper')
const mongoConnection = require('../lib/mongodb_helper')
const BuyerWishlist = require('../entities/BuyerWishlist')

const schema = Joi.object().keys({
    lot_id: Joi.string().required().messages({
        'string.base': 'Lot id should be of type string',
        'string.empty': 'Lot id cannot be an empty field',
        'any.required': 'Lot id is a required field',
    }),
    seller_email: Joi.string().required().messages({
        'string.base': 'Seller email should be of type string',
        'string.empty': 'Seller email cannot be an empty field',
        'any.required': 'Seller email is a required field',
    }),
})
/**
 * Create a buyer wishlist entry based on received data.
 *
 * This function handles the creation of a buyer wishlist entry. It parses incoming data,
 * validates it against a schema, and saves the wishlist entry to the database.
 * The entry includes buyer-specific details retrieved from the authorization context.
 *
 * @param {Object} event - The AWS Lambda event object containing wishlist data.
 * @returns {Object} - An HTTP response object indicating success or failure of the operation.
 */
module.exports.create = async (event) => {
    try {
        const buyerWishlistData = JSON.parse(event.body)
        console.log('in')
        const validationResult = schema.validate(buyerWishlistData)
        if (validationResult.error) {
            const errorMessage = (validationResult.error.details[0].type === 'object.unknown') ? 'Please fill in all the mandatory fields' : validationResult.error.message
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: errorMessage }),
            }
        }
        // const { email } = event.requestContext.authorizer.claims
        const connection = await mongoConnection.connect()
        const wishlist = new BuyerWishlist({
            ...buyerWishlistData,
            buyer_email: event.requestContext.authorizer.claims.email,
        })
        const buyerWishlist = await mongoConnection.save(wishlist, BuyerWishlist)
        if (!buyerWishlist) {
            await connection.disconnect()
            return {
                statusCode: 500,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'There was an error while adding the lot to wishlist' }),
            }
        }
        await connection.disconnect()
        return {
            statusCode: 201,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Lot added to wishlist successfully' }),
        }
    } catch (error) {
        console.log(error)
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: error.message }),
        }
    }
}
