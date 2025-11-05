/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
const Joi = require('joi')
const mongoConnection = require('../lib/mongodb_helper')
const BuyerWishlist = require('../entities/BuyerWishlist')
const helpers = require('../lib/helper')

/* The `const schema` is defining a validation schema using the `Joi` library. It specifies the
expected data types and constraints for each query parameter that can be passed to the `list`
function. */
const schema = Joi.object().keys({
    lot_id: Joi.string().required().messages({
        'string.base': 'Lot id should be of type string',
        'string.empty': 'Lot id cannot be an empty field',
        'any.required': 'Lot id is a required field',
    }),
    buyer_email: Joi.string().required().messages({
        'string.base': 'Buyer email should be of type string',
        'string.empty': 'Buyer email cannot be an empty field',
        'any.required': 'Buyer email is a required field',
    }),
})

module.exports.list = async (event) => {
    try {
        const validationResult = schema.validate(event.queryStringParameters)
        if (validationResult.error) {
            const errorMessage = (validationResult.error.details[0].type === 'object.unknown') ? 'Please pass valid Information' : validationResult.error.message
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: errorMessage }),
            }
        }
        const connection = await mongoConnection.connect()
        const limit = event.queryStringParameters.limit ? parseInt(event.queryStringParameters.limit, 10) : 10
        console.log('limit', limit)
        const pageNumber = (event.queryStringParameters && event.queryStringParameters.page_number) ? event.queryStringParameters.page_number : 1
        const skip = (parseInt(pageNumber, 10) - 1) * limit

        const wishlist = event.queryStringParameters.page_number ? await BuyerWishlist
            .find({ buyer_email: event.queryStringParameters.buyer_email, lot_id: event.queryStringParameters.lot_id })
            // .select('_id date invoice_number invoice_type invoice_total status branch_id student_name student_id class section financial_year academic_year due_amount rcvd_amount') // Adjust fields as needed
            .skip(skip)
            .limit(limit)
            .lean()
            .exec() : await BuyerWishlist
            .find({ buyer_email: event.queryStringParameters.buyer_email, lot_id: event.queryStringParameters.lot_id })
            // .select('_id date invoice_number invoice_type invoice_total status branch_id student_name student_id class section financial_year academic_year due_amount rcvd_amount') // Adjust fields as needed
            .lean()
            .exec()

        const totalCount = await BuyerWishlist.countDocuments({ buyer_email: event.queryStringParameters.buyer_email, lot_id: event.queryStringParameters.lot_id })
        await connection.disconnect()
        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                data: wishlist,
                total_count: totalCount,
            }),
        }
    } catch (error) {
        console.error('Error', error)
        return {
            success_status: false,
            message: error.message,
        }
    }
}
