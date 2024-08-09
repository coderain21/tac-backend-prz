/* eslint-disable consistent-return */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
const Joi = require('joi')
const helpers = require('../lib/helper')
const mongodbHelper = require('../lib/mongodb_helper')
const SiteBanner = require('../entities/SiteBanner')

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
 * @param {object} event - The event object containing the request body
 * @returns {Object} (201) - Created Successfully
 * @returns {Error} (500) - There was an error while creating the
 */
// Function to convert a string to title case
const toTitleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())

module.exports.handler = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            connection = await mongodbHelper.connect()
        }
        const createRequest = JSON.parse(event.body)
        const validationResult = schema.validate(createRequest)

        // Convert audience to title case
        createRequest.audience = toTitleCase(createRequest.audience)
        createRequest.type = toTitleCase(createRequest.type)

        // Validation check
        if (validationResult.error) {
            const errorMessage = (validationResult.error.details[0].type === 'object.unknown') ? 'Please pass valid Information' : validationResult.error.message
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: errorMessage }),
            }
        }
        // Upsert the notification in the database
        const saveNotification = await SiteBanner.findOneAndUpdate(
            { audience: createRequest.audience }, // Filter
            { ...createRequest, updated_at: Date.now() }, // Update fields
            { new: true, upsert: true, setDefaultsOnInsert: true }, // Options
        )

        // Check if the notification was saved successfully
        if (saveNotification) {
            return {
                statusCode: 201,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'Site Banner has been created successfully' }),
            }
        }
        // Log any errors that occur during the process

        return {
            statusCode: 500,
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
