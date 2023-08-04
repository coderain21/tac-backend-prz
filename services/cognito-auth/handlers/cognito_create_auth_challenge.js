/* eslint-disable camelcase */
/* eslint-disable max-len */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
const { config, SES } = require('aws-sdk')
const { generate } = require('otp-generator')

const awsSES = new SES()
config.update({ region: process.env.REGION })

/**
 * @param {String} verificationCode 6 digit OTP, as a feed to the email template
 * @returns success after sending email
 */
async function sendMail(verificationCode, emailTemplate, destination_address) {
    try {
        const param = {
            Source: process.env.SENDER_EMAIL,
            Template: emailTemplate,
            TemplateData: JSON.stringify({ verificationCode }),
            Destination: {
                ToAddresses: [`${destination_address}`],
            },
        }
        const mail = await awsSES.sendTemplatedEmail(param).promise()
        console.log('mail', mail)
        if (mail) {
            return {
                status: true,
            }
        }
        return {
            status: false,
        }
    } catch (error) {
        console.log(error)
        return {
            status: false,
        }
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
            const destination_address = eventData.request.userAttributes.email
            await sendMail(verificationCode, process.env.SELLER_OTP_TEMPLATE, destination_address)
        }
        eventData.response.privateChallengeParameters = {
            verificationCode,
        }
        if (eventData.request.challengeName === 'CUSTOM_CHALLENGE' && eventData.request.session && eventData.request.session.length <= 0) {
            verificationCode = generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false })
            const destination_address = eventData.request.userAttributes.email
            await sendMail(verificationCode, process.env.ADMIN_OTP_TEMPLATE, destination_address)
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
