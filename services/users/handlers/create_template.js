/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/**
 * This API creates or updates templates on the Mailchimp/Mandrill server
 */

const axios = require('axios')
const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const helpers = require('../lib/helper')

const config = {
    MAILCHIMPKEY: process.env.MAILCHIMP_SECRET_KEY,
    MAILADDRESS: process.env.MAILCHIMP_ADDRESS,
}

let connection = null

exports.handler = async (event) => {
    const headers = await helpers.getHeaders()
    if (!connection || !connection.readyState) {
        try {
            connection = await mongoConnection.connect()
        } catch (err) {
            console.error('DB connection error:', err)
            return { statusCode: 500, headers, body: JSON.stringify({ message: 'Database error' }) }
        }
    }

    let body
    try {
        body = JSON.parse(event.body)
    } catch (err) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid JSON' }) }
    }

    const { template_name: templateName, subject, updated_html: updatedHtml } = body
    const templateIdPrefix = templateName.split('-')[0]
    // Authorization
    try {
        const { email } = event.requestContext.authorizer.claims
        const user = await mongoConnection.view(Users, { email_address: email })
        const userData = user[0]
        // eslint-disable-next-line no-underscore-dangle
        if (userData._id.toString() !== templateIdPrefix) {
            return {
                headers,
                statusCode: 403,
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }
    } catch (err) {
        console.error('Auth error:', err)
        return { statusCode: 403, headers, body: JSON.stringify({ message: 'Auth failed' }) }
    }

    const action = event.queryStringParameters?.action || 'create'
    if (!subject || !templateName || !updatedHtml) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: 'Missing required fields' }),
        }
    }

    // Mandrill API
    const apiUrl = `https://mandrillapp.com/api/1.0/templates/${action === 'update' ? 'update' : 'add'}`
    const payload = {
        key: config.MAILCHIMPKEY,
        name: templateName,
        from_email: config.MAILADDRESS,
        subject,
        code: updatedHtml,
        publish: true,
    }

    try {
        const res = await axios.post(apiUrl, payload)
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: `${action} successful`, details: res.data }),
        }
    } catch (err) {
        const msg = err.response?.data?.message || err.message
        const status = err.response?.status || 500
        console.log('status', status)
        if (action === 'update' && msg.includes('No Template found')) {
            return { statusCode: 404, headers, body: JSON.stringify({ message: 'Template not found' }) }
        }
        if (action === 'create' && msg.includes('template with that name already exists')) {
            return { statusCode: 409, headers, body: JSON.stringify({ message: 'Template already exists' }) }
        }
        return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal Server Error' }) }
    }
}
