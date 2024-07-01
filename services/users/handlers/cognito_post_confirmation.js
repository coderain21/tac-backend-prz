/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const AWS = require('aws-sdk')

AWS.config.update({ region: process.env.REGION })
/**
 * Function to handle  cognito post challenge event
 * @param {Object} event
 * @param {Object} _context
 * @param {Object} callback
 * @returns returns event object
 */
const crypto = require('crypto')
const mailchimp = require('@mailchimp/mailchimp_transactional')(process.env.MAILCHIMP_API_KEY)

// Initialize AWS services
const cognito = new AWS.CognitoIdentityServiceProvider()

// Function to create a Mailchimp template
async function createMailchimpTemplate(userEmail) {
    const templateName = `Welcome Template for ${userEmail}`
    const htmlContent = `
        <h1>Welcome to Our Platform, ${userEmail}!</h1>
        <p>We're excited to have you on board.</p>
        <!-- Add more HTML content as needed -->
    `

    try {
        const response = await mailchimp.templates.add({
            name: templateName,
            html: htmlContent,
        })

        console.log('Mailchimp template created:', response)
        return response
    } catch (error) {
        console.error('Error creating Mailchimp template:', error)
        throw error
    }
}

// Handler for the Post Confirmation Lambda trigger
exports.handler = async (event, context) => {
    const userEmail = event.request.userAttributes.email

    try {
        await createMailchimpTemplate(userEmail)
        // Additional logic to handle post-confirmation actions...
        console.log('Mailchimp template creation completed.')
    } catch (error) {
        console.error('Error creating Mailchimp template:', error)
        // Handle error appropriately...
    }
}
