/* eslint-disable no-self-assign */
/* eslint-disable camelcase */
/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-console */

const { StepFunctions, CognitoIdentityServiceProvider } = require('aws-sdk')

const Joi = require('joi')

const mongodbHelper = require('../lib/mongodb_helper')
const helpers = require('../lib/helper')
const Users = require('../entities/Users')
const Admin = require('../entities/Admin')

let connection = null

const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider()

const schema = Joi.object({
    actor_id: Joi.string().required(),
    updated_by: Joi.object().required(),
    section: Joi.object().required(),
})

/**
 * The function `activateDeactivateUser` asynchronously activates or deactivates a user in a Cognito
 * User Pool based on the provided status.
 * @param username - The `username` parameter is the username of the user whose account you want to
 * activate or deactivate in the Cognito User Pool.
 * @param status - The `status` parameter in the `activateDeactivateUser` function indicates whether
 * the user should be activated or deactivated. It can have two possible values:
 * @param UserPoolId - The `UserPoolId` parameter is the unique identifier for the user pool in Amazon
 * Cognito. It is used to specify the user pool to which the user belongs when performing operations
 * related to user management within that user pool.
 * @returns The function `activateDeactivateUser` returns an object with either a `success_status` key
 * set to `true` if the user activation/deactivation was successful, or a `success_status` key set to
 * `false` along with a `message` key containing the error message if there was an error during the
 * process.
 */
async function activateDeactivateUser(username, status, UserPoolId) {
    const params = {
        UserPoolId,
        Username: username,
    }
    try {
        if (status === 'adminEnableUser') {
            await cognitoIdentityServiceProvider.adminEnableUser(params).promise()
        } else {
            await cognitoIdentityServiceProvider.adminDisableUser(params).promise()
            // await cognitoIdentityServiceProvider.adminUserGlobalSignOut(params).promise()
        }
        return { success_status: true }
    } catch (error) {
        return { success_status: false, message: error.message }
    }
}

/**
 * Start an execution of the state machine for the given execution ARN.
 *
 * @param {string} executionARN - The ARN of the state machine to execute
 * @param {Object} lots - The lots to pass to the state machine
 * @returns {Promise} A promise that resolves with the data from the startExecution call if successful,
 * or rejects with an error
 */
async function startExecution(executionARN, event) {
    try {
        // Create a new StepFunctions client
        const stepfunctions = new StepFunctions()
        // Convert the start_date to an ISO string
        // Set up the parameters for the startExecution call
        const params = {
            stateMachineArn: executionARN,
            // Stringify the lots object and use it as the input to the state machine
            input: JSON.stringify(event),
        }

        return new Promise((resolve, reject) => {
            // Start the state machine execution
            stepfunctions.startExecution(params, async (error, data) => {
                // If there is an error, reject the promise with that error
                if (error) {
                    reject(error)
                }
                // If there is data, update the MongoDB record with the execution ARN
                if (data) {
                    // Get the execution ARN from MongoDB
                    resolve(data)
                }
                // If there is no data, resolve the promise with an object with a status of false
                resolve({ status: false })
            })
        })
    } catch (err) {
        // Log the error to the console
        console.log('start err', err)
    }
}
/**
 * The function which disable and enable the seller
 * @param body - {object}
 * @returns {Object} (201) - Updated Successfully
 * @returns {Error} (500) - There was an error while updating seller status
 */

module.exports.handler = async (event) => {
    try {
        if (connection === null || !connection.readyState) {
            console.log('not coonected')
            connection = await mongodbHelper.connect()
        }
        const payload = JSON.parse(event.body)
        if (!payload) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Please pass the required fields',
                }),
            }
        }
        /** -----------------------------------------VALIDATION-------------------------------------------------------------------------------------*/
        const validationResult = schema.validate(payload)
        if (validationResult.error) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Please pass the required fields',
                }),
            }
        }

        /** ---------------------------------------ASSIGNING VARIABLE-------------------------------------------------------------------------------------------------- */

        const emailAddress = event.requestContext.authorizer.claims['cognito:username']
        if (!emailAddress) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Please provide a valid email address',
                }),
            }
        }
        const getAdmin = await mongodbHelper.getUser({ email_address: emailAddress }, Admin)
        if (!getAdmin || getAdmin.length === 0) {
            return {
                statusCode: 404,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'Admin not found',
                }),
            }
        }
        payload.updated_by.email_address = emailAddress
        payload.updated_by.type = 'Admin'
        payload.section.name = 'Seller Management'
        payload.section.action = payload.section.action
        payload.actor_id = getAdmin[0].user_id
        payload.updated_by.name = `${getAdmin[0].first_name} ${getAdmin[0].last_name}`
        const Status = payload.section.action === 'Activate' ? 'adminEnableUser' : 'adminDisableUser'
        const seller_email = payload.section.user_id
        const templateName = payload.section.action === 'Activate' ? process.env.TEMPLATE_ARN_ADMIN_ACTIVATE_SELLER : process.env.TEMPLATE_ARN_ADMIN_DEACTIVATE_SELLER

        /** ----------------------------------------------chnage status in the documentDB------------------------------------------------------------------------------------------------- */
        const query = { email_address: seller_email }
        const updateInformation = {
            status: payload.section.action === 'Activate' ? 'Active' : 'Inactive',
        }
        await mongodbHelper.commonUpdate(Users, query, updateInformation)

        /** ----------------------------------------------COGNITO ACTIVATE/DEACTIVATE----------------------------------------------------------------------------------- */
        const cognitoUpdate = await activateDeactivateUser(seller_email, Status, process.env.SELLER_COGNITO_USERPOOL_ID)

        /** ----------------------------------------------STEP FUNCTION START EXECUTION----------------------------------------------------------------------------------- */
        if (Status !== 'Activate') {
            await startExecution(process.env.STATE_MACHINE_DEACTIVATE_SELLER_ARN, payload)
        }

        /** ----------------------------------------------IF SUCCESS----------------------------------------------------------------------------------- */

        if (cognitoUpdate) {
            await helpers.sendPinpointEmail(seller_email, process.env.SES_SENDER_EMAIL_ID, JSON.stringify({}), templateName)
            return {
                statusCode: 201,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: `Seller ${payload.section.action} successfully`,
                }),
            }
        }

        /** ----------------------------------------------IF SUCCESS----------------------------------------------------------------------------------- */
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: `Seller not ${payload.section.action} successfully`,
            }),
        }
    } catch (error) {
        console.log('Error', error)
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
