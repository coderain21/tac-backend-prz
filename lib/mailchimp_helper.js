/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable max-len */
const mailchimpClient = require('@mailchimp/mailchimp_transactional')(
    process.env.MAILCHIMP_API_KEY,
)
const MailchimpTemplates = require('../entities/MailchimpTemplates')
const mailchimpHelper = require('./mailchimp_templates')

module.exports.createTemplate = async (userData) => {
    try {
        const getTemplate = await mailchimpHelper.defaultTemplates()
        const templates = [
            { name: `${userData.seller_id}-OTP-VALIDATION`, code: getTemplate.otpHtml, subject: 'OTP Verification for your account' },
            { name: `${userData.seller_id}-PADDLE-GENERATION`, code: getTemplate.registrationSuccess, subject: 'Indy.auction-Your Paddle Number Awaits: Registration Successful' },
        ]
        await Promise.all(templates.map((template) => mailchimpClient.templates.add({ ...template, publish: true })))
        const templateSchemas = [
            {
                name: `${userData.seller_id}-OTP-VALIDATION`,
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-OTP-VALIDATION`,
            },
            {
                name: `${userData.seller_id}-PADDLE-GENERATION`,
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-PADDLE-GENERATION`,
            },
        ]
        for (const template of templateSchemas) {
            await MailchimpTemplates.updateOne(
                { seller_email: template.seller_email }, // Filter by seller_email
                { $set: template }, // Update fields
                { upsert: true }, // Options
            )
        }
        // const savingTemplates = await MailchimpTemplates.insertMany(templateSchemas)
        return true
    } catch (error) {
        console.error('Mailchimp Error:', error)
        return error
    }
}
