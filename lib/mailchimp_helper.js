/* eslint-disable import/no-unresolved */
/* eslint-disable no-continue */
/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable max-len */
const mailchimpClient = require('@mailchimp/mailchimp_transactional')(
    process.env.MAILCHIMP_SECRET_KEY,
)
const axios = require('axios')
const MailchimpTemplates = require('../entities/MailchimpTemplates')
const mailchimpHelper = require('./mailchimp_templates')
const mongodbHelper = require('./mongodb_helper')

async function fetchMandrillTemplate(templateName) {
    const apiKey = process.env.MAILCHIMP_SECRET_KEY
    if (!apiKey) {
        throw new Error('MANDRILL_API_KEY environment variable is not set')
    }

    const url = 'https://mandrillapp.com/api/1.0/templates/info'

    try {
        const response = await axios.post(url, {
            key: apiKey,
            name: templateName,
        })

        return response.data.code // The HTML content of the template
    } catch (error) {
        console.error('Error fetching Mandrill template:', error.message)
        throw error
    }
}

module.exports.createTemplate = async (userData) => {
    try {
        const getTemplate = await mailchimpHelper.defaultTemplates()

        // First, fetch all template contents
        const [otpTemplate, paddleTemplate, congratsTemplate, winningTemplate, outbidTemplate] = await Promise.all([
            fetchMandrillTemplate('buyer-default-otp-template'),
            fetchMandrillTemplate('buyer-default-paddle-template'),
            fetchMandrillTemplate('default-congratulations-email'),
            fetchMandrillTemplate('bid-notification'),
            fetchMandrillTemplate('outbid-notification'),
        ])

        const templates = [
            {
                name: `${userData.seller_id}-OTP-VALIDATION`,
                html: otpTemplate,
                subject: 'OTP Verification for your account',
                from_email: 'no-reply@indy.auction',
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-OTP-VALIDATION`,
                type: 'otp',
            },
            {
                name: `${userData.seller_id}-PADDLE-GENERATION`,
                html: paddleTemplate,
                subject: 'Indy.auction-Your Paddle Number Awaits: Registration Successful',
                from_email: 'no-reply@indy.auction',
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-PADDLE-GENERATION`,
                type: 'paddle',
            },
            {
                name: `${userData.seller_id}-CONGRATULATION-EMAIL`,
                html: congratsTemplate,
                from_email: 'no-reply@indy.auction',
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-CONGRATULATION-EMAIL`,
                type: 'congratulation-email',
            },
            {
                name: `${userData.seller_id}-PAYMENT-RECEIPT`,
                html: getTemplate.paymentRecieptHtml,
                subject: 'Payment Receipt',
                from_email: 'no-reply@indy.auction',
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-PAYMENT-RECEIPT`,
                type: 'payment-reciept',
            },
            {
                name: `${userData.seller_id}-WINNING-EMAIL`,
                html: winningTemplate,
                from_email: 'no-reply@indy.auction',
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-WINNING-EMAIL`,
                type: 'winning-email',
            },
            {
                name: `${userData.seller_id}-OUTBID-EMAIL`,
                html: outbidTemplate,
                from_email: 'no-reply@indy.auction',
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-OUTBID-EMAIL`,
                type: 'outbid-email',
            },
        ]

        // Now add templates to Mailchimp
        for (const template of templates) {
            await MailchimpTemplates.updateOne(
                { seller_email: template.seller_email, name: template.name }, // Filter by seller_email
                { $set: template }, // Update fields
                { upsert: true }, // Options
            )
            if (template.html) {
                console.log(`Template HTML content (first 100 chars): ${template.html.substring(0, 100)}...`)
            } else {
                console.log(`Warning: No HTML content for template ${template.name}`)
                continue // Skip this template if there's no HTML content
            }

            try {
                const response = await mailchimpClient.templates.add({
                    name: template.name,
                    from_email: template.from_email,
                    subject: template.subject,
                    code: template.html,
                    publish: true,
                })
                if (!response.code) {
                    const updateResponse = await mailchimpClient.templates.update({
                        name: template.name,
                        code: template.html,
                    })
                    console.log(`Update response for ${template.name}:`, updateResponse)
                }
            } catch (error) {
                console.error(`Error creating/updating template ${template.name}:`, error)
            }
        }

        return true
    } catch (error) {
        console.error('Mailchimp Error:', error)
        return error
    }
}

async function getMandrillTemplate(seller_id) {
    try {
        const response = await axios.post('https://mandrillapp.com/api/1.0/templates/info', {
            name: `${seller_id}-CONGRATULATION-EMAIL`,
            key: process.env.MAILCHIMP_SECRET_KEY,
        })
        return true
    } catch (error) {
        console.log('Error fetching template:', error)
        if (error.response && error.response.status === 404) {
            console.log('template not found')
        }
        return false
    }
}

module.exports.sendTemplateEmails = async (email_address, templateData) => {
    try {
        const hasTotalAmount = templateData.total_amount !== 0
        const hasNotWinningLot = templateData.not_winning_lot_count !== 0

        const send_message = {
            from_email: 'no-reply@indy.auction',
            subject: templateData.subject,
            text: 'Welcome to Mailchimp Transactional!',
            to: [{ email: email_address, type: 'to' }],
            merge_language: 'handlebars',
            merge: true,
            global_merge_vars: [
                { name: 'buyer', content: templateData.buyer },
                { name: 'title1', content: templateData.title },
                { name: 'logo_url', content: templateData.logo_url },
                { name: 'winning_lot', content: templateData.winning_lot }, // This should be passed correctly
                { name: 'winning_lot_count', content: templateData.winning_lot_count.toString() },
                { name: 'not_winning_lot', content: templateData.not_winning_lot },
                { name: 'not_winning_lot_count', content: templateData.not_winning_lot_count.toString() },
                { name: 'payment_content', content: templateData.paymentContent },
                { name: 'seller_email', content: templateData.seller_email },
                { name: 'seller_name', content: templateData.seller_name },
                { name: 'total_amount', content: templateData.total_amount },
                { name: 'checkout_url', content: templateData.checkout_url },
                { name: 'has_total_amount', content: hasTotalAmount },
                { name: 'has_not_winning_lot', content: hasNotWinningLot },

            ],
        }
        const congratulationsEmail = await getMandrillTemplate(templateData.seller_id)
        const emailTemplateName = congratulationsEmail
            ? `${templateData.seller_id}-CONGRATULATION-EMAIL`
            : 'default_congratulations_email'
        const param = {
            template_name: emailTemplateName,
            template_content: [],
            message: send_message,
        }
        const response = await mailchimpClient.messages.sendTemplate(param)
    } catch (error) {
        console.log('error: ', error)
    }
}

module.exports.sendMailchimpEmail = async (email, templateName, templateData, senderEmail) => {
    try {
        const response = await mailchimpClient.messages.sendTemplate({
            template_name: templateName,
            template_content: [],
            message: {
                to: [{ email, type: 'to' }],
                from_email: senderEmail,
                global_merge_vars: Object.keys(templateData).map((key) => ({
                    name: key,
                    content: templateData[key],
                })),
            },
        })
        console.log('response', response)
    } catch (error) {
        console.error(error)
    }
}
