/* eslint-disable camelcase */
/* eslint-disable max-len */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
const { generate } = require('otp-generator')

const {
    config, PinpointEmail,
} = require('aws-sdk')

const pinpoint = new PinpointEmail()

config.update({ region: process.env.REGION })

/**
 * @param {String} verificationCode 6 digit OTP, as a feed to the email template
 * @returns success after sending email
 */
async function sendMail(destinationId, sourceId, templateData, templateArn) {
    const params = {
        Content: {
            Template: {
                TemplateArn: templateArn,
                TemplateData: templateData,
            },
        },
        FromEmailAddress: sourceId,
        Destination: {
            ToAddresses: [destinationId],
        },
    }
    try {
        await pinpoint.sendEmail(params).promise()
    } catch (error) {
        console.error('Failed to send email:', error)
    }
}

/**
 * Function create cognito auth challenge for admin
 * @param {Object} event
 * @param {Object} _context
 * @param {Object} callback
 * @returns returns event object
 */
exports.handler = async (event, _context, callback) => {
    console.log(event)
    const eventData = event
    try {
        let verificationCode = ''
        if (eventData.request.session.length > 2) {
            const sessionLength = eventData.request.session.length
            verificationCode = eventData.request.session[sessionLength - 1].challengeMetadata
            eventData.response.privateChallengeParameters = {
                verificationCode,
            }
            eventData.response.challengeMetadata = verificationCode
            callback(null, eventData)
        } else if (eventData.request.challengeName === 'CUSTOM_CHALLENGE' && eventData.request.session.length === 2) {
            verificationCode = generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false })
            const destination_address = eventData.userName
            await sendMail(destination_address, process.env.SES_SENDER_EMAIL_ID, JSON.stringify({ otp: verificationCode }), process.env.TEMPLATE_ARN_EMAIL_OTP)
        }
        eventData.response.privateChallengeParameters = {
            verificationCode,
        }
        if (eventData.request.challengeName === 'CUSTOM_CHALLENGE' && eventData.request.session && eventData.request.session.length <= 0) {
            verificationCode = generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false })
            const destination_address = eventData.userName
            await sendMail(destination_address, process.env.SES_SENDER_EMAIL_ID, JSON.stringify({ otp: verificationCode }), process.env.TEMPLATE_ARN_EMAIL_OTP)
        }

        eventData.response.challengeMetadata = verificationCode
        callback(null, eventData)

        return true
    } catch (error) {
        console.log(error)
        callback('Something went wrong', eventData)
        return false
    }
}
