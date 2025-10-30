/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const UserPlanHistory = require('../entities/UserPlanHistory')

const dataHelper = require('../data/plan_validation_check')
const helpers = require('../lib/helper')

let body
let connection = null

module.exports.updatePlan = async (event) => {
    try {
        const request_body = JSON.parse(event.body)
        const email = decodeURIComponent(event.pathParameters.email)

        // Authorization check to verify user has permission to update this profile
        try {
            const email_address = event.requestContext.authorizer.claims.email
            if (email_address !== email) {
                return {
                    headers: await helpers.getHeaders(),
                    statusCode: 403,
                    body: JSON.stringify({
                        message: 'You do not have access to perform this API action',
                    }),
                }
            }
        } catch (error) {
            return {
                headers: await helpers.getHeaders(),
                statusCode: 403,
                body: JSON.stringify({
                    message: 'You do not have access to perform this API action',
                }),
            }
        }
        const keys = Object.keys(request_body)
        let update_value
        if (connection === null || !connection.readyState) {
            console.log('not coonected')
            connection = await mongoConnection.connect()
        }
        if (keys.length === 0) {
            body = JSON.stringify({
                message: 'Please pass atleast one field',
            })
            return {
                headers: await helpers.getHeaders(),
                statusCode: 400,
                body,
            }
        }
        const plan_validation = await dataHelper.validationCheck(request_body)
        if (plan_validation.success_status === true) {
            const get_user = await mongoConnection.view(Users, { email_address: email })
            const user_id = get_user[0]._id
            update_value = {
                free_user: false,
                plan_type: request_body.new_plan,
            }
            const update_user_information = await mongoConnection.updateUsingMongoDB(process.env.MONGO_CLIENT, process.env.DATABASE, process.env.SELLERS_TABLE, user_id, update_value)
            const plan_history_data = {
                user_type: 'seller',
                user_name: get_user[0].user_name,
                email_address: email,
                previous_plan: request_body.current_plan,
                current_plan: request_body.new_plan,
                updated_plan_type: request_body.plan_status,
            }
            if (update_user_information.acknowledged) {
                const user = await mongoConnection.save(plan_history_data, UserPlanHistory)
                console.log('user', user)
                body = JSON.stringify({
                    success_status: true,
                    message: 'Changes saved successfully',
                })
                return {
                    headers: await helpers.getHeaders(),
                    statusCode: 204,
                    body,
                }
            }
        }
        body = JSON.stringify({
            message: 'Please choose correct plan upgrade or downgrade.',
        })
        return {
            headers: await helpers.getHeaders(),
            statusCode: 400,
            body,
        }
    } catch (error) {
        console.log('Error', error)
        body = JSON.stringify({
            message: 'Failed to update information',
        })
        return {
            headers: await helpers.getHeaders(),
            statusCode: 400,
            body,
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
