/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
const Joi = require('joi')
const helpers = require('../lib/helper')
const mongodbHelper = require('../lib/mongodb_helper')
const SiteBannerNotification = require('../entities/SiteBannerNotification')

let connection = null

/* The `const schema` is defining a validation schema using the `Joi` library. It specifies the
expected data types and constraints for each query parameter that can be passed to the `list`
function. */

const schema = Joi.object().keys({
    type: Joi.string().required().messages({
        'string.base': 'Type should be of type string',
        'string.empty': 'Type cannot be an empty field',
        'any.required': 'Type is a required field',
    }),
    audience: Joi.string().required().messages({
        'string.base': 'Audience should be of type string',
        'string.empty': 'Audience cannot be an empty field',
        'any.required': 'Audience is a required field',
    }),
    notification: Joi.string().required().messages({
        'string.base': 'Notification should be of type string',
        'string.empty': 'Notification cannot be an empty field',
        'any.required': 'Notification is a required field',
    }),
})

/**
 * The function will trigger after creating sitebar notifications from the admin panel
 * @param body - {object}
 * @returns {Object} (201) - Created Successfully
 * @returns {Error} (500) - There was an error while creating the
 */

module.exports.handler = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            console.log('not coonected')
            connection = await mongodbHelper.connect()
        }
        const createRequest = JSON.parse(event.body)
        console.log('notification request', createRequest)
        const validationResult = schema.validate(createRequest)
        if (validationResult.error) {
            const errorMessage = (validationResult.error.details[0].type === 'object.unknown') ? 'Please pass valid Information' : validationResult.error.message
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: errorMessage }),
            }
        }
        const saveNotification = await mongodbHelper.save(createRequest, SiteBannerNotification)
        if (saveNotification) {
            return {
                statusCode: 204,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Notification created Successfully' }),
            }
        }
        return {
            statusCode: 400,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'There is an error while creating sitebanner notification' }),
        }
    } catch (err) {
        console.log('error', err)
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
