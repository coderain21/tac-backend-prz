/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
const { ObjectId } = require('mongodb')

const Joi = require('joi')

const mailchimp = require('@mailchimp/mailchimp_transactional')

const Auction = require('../entities/Auction')
const Counter = require('../entities/Counter')
const Subdomain = require('../entities/SubDomain')
const Users = require('../entities/Users')

const helpers = require('../lib/helper')
const RegisteredUser = require('../entities/RegisteredUser')

const mongodbHelper = require('../lib/mongodb_helper')
const mailchimpHelper = require('../lib/mailchimp_helper')

const schema = Joi.object().keys({
    status: Joi.string().required().messages({
        'string.empty': 'please pass the value for status',
        'string.base': 'status should be of type string',
        'any.required': 'status is a required field',
    }),
    seller_email: Joi.string().required().messages({
        'string.empty': 'please pass the value for seller_email',
        'string.base': 'status should be of type string',
        'any.required': 'status is a required field',
    }),
    auction_id: Joi.string().required().messages({
        'string.empty': 'please pass the value for auction_id',
        'string.base': 'auction_id should be of type string',
        'any.required': 'auction_id is a required field',
    }),
    email_address: Joi.string().required().messages({
        'string.empty': 'please pass the value for email',
        'string.base': 'email should be of type string',
        'any.required': 'email is a required field',
    }),
    first_name: Joi.string().required().messages({
        'string.empty': 'please pass the value for email',
        'string.base': 'email should be of type string',
        'any.required': 'email is a required field',
    }),
})

let body

let connection

/**
 * List Bidders | Admin Accept and Reject the Buyers
 * @description - API to accept or reject the buyers
 * @route - GET /{buyer_id}
 * @access - (Private)
 * @user - IndyAuction Admin
 * @returns {Object} (200) - Accept and Reject the Buyers
 * @returns {Error} (500) - There was an error while updating the buyers
 */
module.exports.handler = async (event) => {
    try {
        /** Establish database connection */
        connection = await mongodbHelper.connect()
        const buyerId = decodeURIComponent(event.pathParameters.buyer_id)
        const requestBody = JSON.parse(event.body)
        const validationResult = schema.validate(requestBody)
        if (validationResult.error) {
            const errorMessage = (validationResult.error.details[0].type === 'object.unknown') ? 'Please pass valid Information' : validationResult.error.message
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: errorMessage }),
            }
        }
        const query = { _id: new ObjectId(buyerId) }
        if (requestBody.status === 'Approved') {
            const query1 = {
                seller_email: requestBody.seller_email,
                _id: new ObjectId(requestBody.auction_id),
            }
            const getAuction = await mongodbHelper.view(Auction, query1)
            const getPaddle = await Counter.findOneAndUpdate({
                seller_email: requestBody.seller_email,
                auction_id: new ObjectId(requestBody.auction_id),
                record_type: 'Paddle',
            }, { $inc: { starting_sequence: 1 } }, { new: true, upsert: true }).exec()

            // const getPaddle = await mongodbHelper.view(Counter, query2)
            const startDate = new Date(getAuction[0].start_date)
            const endDate = new Date(getAuction[0].end_date)

            // Get individual components of the date
            const startYear = startDate.getFullYear()
            const startMonth = String(startDate.getMonth() + 1).padStart(2, '0') // Months are zero-based, so add 1
            const startDay = String(startDate.getDate()).padStart(2, '0')

            const endYear = endDate.getFullYear()
            const endMonth = String(endDate.getMonth() + 1).padStart(2, '0') // Months are zero-based, so add 1
            const endDay = String(endDate.getDate()).padStart(2, '0')

            // Construct the date string with hyphens
            const formattedStartDate = `${startYear}-${startMonth}-${startDay}`
            const formattedEndDate = `${endYear}-${endMonth}-${endDay}`

            // Use toLocaleTimeString() to get a formatted time string based on the user's locale
            const formattedStartTime = startDate.toLocaleTimeString()
            const formattedEndTime = endDate.toLocaleTimeString()
            const subdomain = await mongodbHelper.getSubdomain({ seller_email: requestBody.seller_email }, Subdomain)
            const url = `https://${subdomain.subdomain}.${process.env.AMPLIFY_DOMAIN_NAME}/auctions/${getAuction[0]._id}`
            const template_data = {
                Seller_name: 'Admin',
                paddle: getPaddle.starting_sequence,
                user_first_name: requestBody.first_name,
                Auction_title: getAuction[0].title,
                auction_start_date: formattedStartDate,
                auction_start_time: formattedStartTime,
                auction_end_date: formattedEndDate,
                auction_end_time: formattedEndTime,
                auction_image: `${process.env.CDN_LINK}${getAuction[0].auction_image}`,
                color: getAuction[0].paddle.text_color === '' ? '#FFFFFF' : getAuction[0].paddle.text_color,
                background_color: getAuction[0].paddle.background_color === '' ? '#000000' : getAuction[0].paddle.background_color,
                // img: getAuction[0].logo_image === '' ? `${os.environ.CDN_LINK}Logo.png` : `${os.environ.CDN_LINK}${getAuction[0].logo_image}`,
                subject: 'Indy.auction-Your Paddle Number Awaits: Registration Successful',
                logo: getAuction[0].logo_image === '' ? `${process.env.CDN_LINK}Logo.png` : `${process.env.CDN_LINK}${getAuction[0].logo_image}`,
                Seller_email: requestBody.seller_email,
                domainURL: url,
            }

            const seller = await mongodbHelper.getUser({ email_address: requestBody.seller_email }, Users)
            console.log('seller', seller)
            const sellerId = seller[0].seller_id
            let templateName = `${sellerId}-PADDLE-GENERATION`
            console.log('template', templateName)
            const mailchimpClient = await mailchimp(process.env.MAILCHIMP_SECRET_KEY)
            try {
                const response = await mailchimpClient.templates.info({ name: templateName })
                console.log('Mailchimp template response:', response)
            } catch (error) {
                console.error('Error getting Mailchimp template:', error)
                templateName = 'buyer_default_paddle_template'
            }

            await mailchimpHelper.sendMailchimpEmail(requestBody.email_address, templateName, template_data, process.env.MAILCHIMP_ADDRESS)
            requestBody.paddle = getPaddle.starting_sequence
        }
        const updateStatus = await mongodbHelper.commonUpdate(RegisteredUser, query, requestBody)

        if (updateStatus.acknowledged) {
            body = JSON.stringify({
                success_status: true,
                message: 'Status updated successfully',
            })
            return {
                headers: await helpers.getHeaders(),
                statusCode: 204,
                body,
            }
        }
        body = JSON.stringify({
            message: 'Please Pass the correct information to update.',
        })
        return {
            headers: await helpers.getHeaders(),
            statusCode: 400,
            body,
        }
    } catch (error) {
        /** Log and handle errors */
        console.error(error)
        return {
            statusCode: 404,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'User not found',
            }),
        }
    } finally {
        // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
