/* eslint-disable camelcase */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable max-len */
const mailchimpClient = require('@mailchimp/mailchimp_transactional')(
    process.env.MAILCHIMP_SECRET_KEY,
)
const MailchimpTemplates = require('../entities/MailchimpTemplates')
const mailchimpHelper = require('./mailchimp_templates')
const mongodbHelper = require('./mongodb_helper')

module.exports.createTemplate = async (userData) => {
    try {
        const getTemplate = await mailchimpHelper.defaultTemplates()
        const templates = [
            {
                name: `${userData.seller_id}-OTP-VALIDATION`, code: getTemplate.otpHtml, subject: 'OTP Verification for your account', from_email: 'no-reply@indy.auction',
            },
            {
                name: `${userData.seller_id}-PADDLE-GENERATION`, code: getTemplate.registrationSuccess, subject: 'Indy.auction-Your Paddle Number Awaits: Registration Successful', from_email: 'no-reply@indy.auction',
            },
            {
                name: `${userData.seller_id}-CONGRATULATION-EMAIL`, code: getTemplate.congratulationsHtml, from_email: 'no-reply@indy.auction',
            },
            {
                name: `${userData.seller_id}-PAYMENT-RECEIPT`, code: getTemplate.paymentRecieptHtml, subject: 'Payment Receipt', from_email: 'no-reply@indy.auction',
            },
            {
                name: `${userData.seller_id}-WINNING-EMAIL`, code: getTemplate.winningBidHtml, from_email: 'no-reply@indy.auction',
            },
            {
                name: `${userData.seller_id}-OUTBID-EMAIL`, code: getTemplate.outBidHtml, from_email: 'no-reply@indy.auction',
            },
        ]
        await Promise.all(templates.map((template) => mailchimpClient.templates.add({ ...template, publish: true })))
        const templateSchemas = [
            {
                name: `${userData.seller_id}-OTP-VALIDATION`,
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-OTP-VALIDATION`,
                type: 'otp',
            },
            {
                name: `${userData.seller_id}-PADDLE-GENERATION`,
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-PADDLE-GENERATION`,
                type: 'paddle',
            },
            {
                name: `${userData.seller_id}-CONGRATULATION-EMAIL`,
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-CONGRATULATION-EMAIL`,
                type: 'congratulation-email',
            },
            {
                name: `${userData.seller_id}-PAYMENT-RECEIPT`,
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-PAYMENT-RECEIPT`,
                type: 'payment-reciept',
            },
            {
                name: `${userData.seller_id}-WINNING-EMAIL`,
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-WINNING-EMAIL`,
                type: 'winning-email',
            },
            {
                name: `${userData.seller_id}-OUTBID-EMAIL`,
                seller_email: userData.email_address,
                seller_id: userData.seller_id,
                slug: `${userData.seller_id}-OUTBID-EMAIL`,
                type: 'outbid-email',
            },
        ]
        for (const template of templateSchemas) {
            await MailchimpTemplates.updateOne(
                { seller_email: template.seller_email, name: template.name }, // Filter by seller_email
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
        const templateQuery = {
            type: ['congratulation-email'],
            seller_email: templateData.seller_email,
        }
        const sellerTemplates = await mongodbHelper.getTemplate(templateQuery, MailchimpTemplates)
        let emailTemplateName
        if (sellerTemplates.length > 0) {
            emailTemplateName = sellerTemplates[0].name
        }
        emailTemplateName = 'default_congratulations_email'
        const param = {
            template_name: emailTemplateName,
            template_content: [],
            message: send_message,
        }
        const response = await mailchimpClient.messages.sendTemplate(param)
        console.log('response: ', response)
    } catch (error) {
        console.log('error: ', error)
    }
}
