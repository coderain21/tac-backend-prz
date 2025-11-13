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
const Subdomain = require('../entities/SubDomain')
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

module.exports.fetchMandrillTemplate = fetchMandrillTemplate

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

async function getPaymentRequestTemplate(seller_id) {
    try {
        const response = await axios.post('https://mandrillapp.com/api/1.0/templates/info', {
            name: `${seller_id}-PAYMENT-REQUEST-EMAIL`,
            key: process.env.MAILCHIMP_SECRET_KEY,
        })
        return true
    } catch (error) {
        console.log('Error fetching payment request template:', error)
        if (error.response && error.response.status === 404) {
            console.log('payment request template not found')
        }
        return false
    }
}

/**
 * Get template name based on bid type - fetch only what's needed
 */
async function getBidConfirmationTemplate(sellerId, bidType) {
    const templateSuffix = bidType === 'telephone'
        ? 'TELEPHONE-BID-CONFIRMATION'
        : 'ABSENTEE-BID-CONFIRMATION'

    const defaultTemplate = bidType === 'telephone'
        ? 'buyer_default_telephone_bid_confirmation'
        : 'buyer_default_absentee_bid_confirmation'

    try {
        const response = await axios.post('https://mandrillapp.com/api/1.0/templates/info', {
            name: `${sellerId}-${templateSuffix}`,
            key: process.env.MAILCHIMP_SECRET_KEY,
        })
        return `${sellerId}-${templateSuffix}`
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`${bidType} template not found for seller ${sellerId}, using default`)
            return defaultTemplate
        }
        console.error(`Error fetching ${bidType} template:`, error)
        return defaultTemplate // Fallback to default on any error
    }
}

module.exports.getBidConfirmationTemplate = getBidConfirmationTemplate

function formatCurrency(amount, currencyCode) {
    try {
        // Convert amount to a string
        const amountString = String(amount)

        // Remove currency symbol and commas
        const cleanedAmount = amountString.replace(/[^\d.]/g, '')

        const parsedAmount = parseFloat(cleanedAmount)

        // Return an error string if the amount is not a valid number
        if (Number.isNaN(parsedAmount)) {
            console.error(`Invalid amount: ${amountString}`)
            return 'Invalid amount'
        }

        // Include commas and currency symbol in the formatted result
        const formattedAmount = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(parsedAmount)

        return formattedAmount
    } catch (err) {
        console.error(err)
        return err
    }
}

module.exports.sendTemplateEmails = async (email_address, templateData, currencyCode) => {
    try {
        const hasTotalAmount = templateData.total_amount !== 0
        const hasNotWinningLot = templateData.not_winning_lot_count !== 0
        const total_amount = formatCurrency(templateData.total_amount, currencyCode || 'USD')

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
                { name: 'total_amount', content: total_amount },
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
        if (((process.env.STAGE === 'pre-production' || process.env.STAGE === 'beta') && email_address.startsWith('indyauctiontestops+k6'))) {
            console.log('skipping sending for ', email_address)
            return
        }
        const response = await mailchimpClient.messages.sendTemplate(param)
    } catch (error) {
        console.log('error: ', error)
    }
}

module.exports.sendPaymentRequestEmail = async (email_address, templateData, currencyCode) => {
    try {
        const hasTotalAmount = templateData.total_amount !== 0
        const hasNotWinningLot = templateData.not_winning_lot_count !== 0
        const total_amount = formatCurrency(templateData.total_amount, currencyCode || 'USD')

        const send_message = {
            from_email: 'no-reply@indy.auction',
            subject: templateData.subject || 'Payment Request',
            text: 'Payment Request',
            to: [{ email: email_address, type: 'to' }],
            merge_language: 'handlebars',
            merge: true,
            global_merge_vars: [
                { name: 'buyer', content: templateData.buyer },
                { name: 'title1', content: templateData.title },
                { name: 'logo_url', content: templateData.logo_url },
                { name: 'winning_lot', content: templateData.winning_lot },
                { name: 'winning_lot_count', content: templateData.winning_lot_count.toString() },
                { name: 'not_winning_lot', content: templateData.not_winning_lot },
                { name: 'not_winning_lot_count', content: templateData.not_winning_lot_count.toString() },
                { name: 'payment_content', content: templateData.paymentContent },
                { name: 'seller_email', content: templateData.seller_email },
                { name: 'seller_name', content: templateData.seller_name },
                { name: 'total_amount', content: total_amount },
                { name: 'checkout_url', content: templateData.checkout_url },
                { name: 'has_total_amount', content: hasTotalAmount },
                { name: 'has_not_winning_lot', content: hasNotWinningLot },
            ],
        }
        const paymentRequestTemplate = await getPaymentRequestTemplate(templateData.seller_id)
        const emailTemplateName = paymentRequestTemplate
            ? `${templateData.seller_id}-PAYMENT-REQUEST-EMAIL`
            : 'default_payment_request'
        const param = {
            template_name: emailTemplateName,
            template_content: [],
            message: send_message,
        }
        if (((process.env.STAGE === 'pre-production' || process.env.STAGE === 'beta') && email_address.startsWith('indyauctiontestops+k6'))) {
            console.log('skipping sending for ', email_address)
            return
        }
        const response = await mailchimpClient.messages.sendTemplate(param)
    } catch (error) {
        console.log('error sending payment request email: ', error)
        throw error
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

module.exports.sendTransactionalEmail = async (getLotHistoryDetails, currentLotDetails, auctionDetails, currentBidDetails, buyerInformation, templateName) => {
    try {
        // Get featured image URLs
        const featuredImage = currentLotDetails.images?.find((image) => image.featured)
        const lotImage = featuredImage ? `${process.env.CDN_URL || ''}${featuredImage.url}` : ''

        let auctionImage = ''
        if (Array.isArray(auctionDetails.auction_image)) {
            const featuredAuctionImage = auctionDetails.auction_image.find((image) => image.featured)
            auctionImage = featuredAuctionImage ? `${process.env.CDN_URL || ''}${featuredAuctionImage.url}` : ''
        } else if (auctionDetails.auction_image) {
            auctionImage = `${process.env.CDN_URL || ''}${auctionDetails.auction_image}`
        }

        // Format bid amount with currency
        const currencyCode = auctionDetails.currency || currentBidDetails.currency || 'USD' // fallback to USD
        const bidAmount = formatCurrency(currentBidDetails.bid_amount, currencyCode)

        // Get auction end time
        const auctionEndDate = auctionDetails.end_date
            ? new Date(auctionDetails.end_date).toLocaleDateString()
            : new Date(auctionDetails.start_date).toLocaleDateString()

        // Prepare seller information
        const sellerName = auctionDetails.seller_name || auctionDetails.seller_email?.split('@')[0] || 'Seller'

        // Logo URL
        const logo_url = auctionDetails.logo_image
            ? `${process.env.CDN_URL || ''}${auctionDetails.logo_image}`
            : `${process.env.CDN_URL || ''}Logo.png`

        const subdomainQuery = {
            seller_email: currentLotDetails.seller_email,
        }
        const auctionRedirectionURL = await mongodbHelper.getSubdomain(subdomainQuery, Subdomain)

        // Build URLs
        const domainURL = `https://${auctionRedirectionURL.subdomain}.${process.env.AMPLIFY_DOMAIN_NAME}/auctions/${auctionDetails._id}`
        const lotRedirectionURL = `https://${auctionRedirectionURL.subdomain}.${process.env.AMPLIFY_DOMAIN_NAME}/auctions/${auctionDetails._id}/lots/${currentBidDetails.lot_id}`

        // Prepare extension content based on bid type
        let extensionContent = ''
        if (currentBidDetails.bid_type === 'telephone') {
            extensionContent = 'A member of our team will call you during the live auction.'
        } else {
            // Default extension content for absentee bids
            switch (auctionDetails.extension_type) {
            case 'Individual Lots':
                extensionContent = `Any bid placed in the last minute of a lot closing, extends the bidding on the individual lot by ${auctionDetails.extension_time || 5} minutes. This may mean that the lots close out of sequential order.`
                break
            case 'Cascade':
                extensionContent = `A bid placed in the last minute of a lot closing, extends the bidding by ${auctionDetails.extension_time || 5} minutes on this lot and any subsequent lots.`
                break
            default:
                extensionContent = `Any bids placed in the last minute extend the bidding on all the lots in the auction by ${auctionDetails.extension_time || 5} minutes.`
                break
            }
        }

        // Prepare subject line based on bid type
        const lotTitle = currentLotDetails.title2
            ? `${currentLotDetails.title1} - ${currentLotDetails.title2}`
            : currentLotDetails.title1

        const subjectLine = currentBidDetails.bid_type === 'telephone'
            ? `Telephone Bid: Lot ${currentLotDetails.lot_number}, ${lotTitle}`
            : `Absentee bid: Lot ${currentLotDetails.lot_number}, ${lotTitle}`

        // Extract first name
        const firstName = buyerInformation.first_name || buyerInformation.full_name?.split(' ')[0] || 'Bidder'

        // Prepare email message
        const send_message = {
            from_email: 'no-reply@indy.auction',
            subject: subjectLine,
            text: 'Welcome to Mailchimp Transactional!',
            to: [{ email: buyerInformation.email_address, type: 'to' }],
            merge_vars: [{
                rcpt: buyerInformation.email_address,
                vars: [
                    { name: 'logo_url', content: logo_url },
                    { name: 'first_name', content: firstName },
                    { name: 'auction_title', content: auctionDetails.title || auctionDetails.auction_title },
                    { name: 'extension_content', content: extensionContent },
                    { name: 'auction_image', content: auctionImage },
                    { name: 'lot_image', content: lotImage },
                    { name: 'lot_title', content: currentLotDetails.title1 },
                    { name: 'bid_amount', content: bidAmount }, // Now properly formatted
                    { name: 'seller_name', content: sellerName },
                    { name: 'auction_date', content: auctionEndDate },
                    { name: 'auction_url', content: domainURL },
                    { name: 'seller_email', content: currentLotDetails.seller_email || auctionDetails.seller_email },
                    { name: 'lot_number', content: currentLotDetails.lot_number },
                    { name: 'lot_redirection_url', content: lotRedirectionURL },
                    { name: 'country_code', content: currentBidDetails.country_code },
                    { name: 'number', content: currentBidDetails.phone_number },
                ],
            }],
        }

        const param = {
            template_name: templateName,
            template_content: [],
            message: send_message,
        }

        // Skip sending for test environments
        if (((process.env.STAGE === 'pre-production' || process.env.STAGE === 'beta')
             && buyerInformation.email_address.startsWith('indyauctiontestops+k6'))) {
            console.log('Skipping email send for test account:', buyerInformation.email_address, templateName)
            return { success: true, skipped: true }
        }

        const response = await mailchimpClient.messages.sendTemplate(param)
        console.log('Bid confirmation email sent successfully:', response)

        return { success: true, response }
    } catch (err) {
        console.error('Error sending transactional email:', err)
        throw new Error(`Failed to send bid confirmation email: ${err.message}`)
    }
}
