/* eslint-disable no-console */
/* eslint-disable camelcase */
/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-plusplus */

const {
    config, PinpointEmail,
} = require('aws-sdk')

const pinpoint = new PinpointEmail()
const CryptoJS = require('crypto-js')

config.update({ region: process.env.REGION })

module.exports.getHeaders = () => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
})

module.exports.sendPinpointEmail = async (destinationId, sourceId, templateData, templateArn) => {
    console.log(templateArn)
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
    console.log(params.Content.Template)
    console.log(JSON.stringify(params), 'params')
    try {
        const response = await pinpoint.sendEmail(params).promise()
        console.log('Email sent successfully:', response)
    } catch (error) {
        console.error('Failed to send email:', error)
    }
}

module.exports.encryptDecryptPassword = async (data, flag) => {
    console.log(data, flag)
    let responseData
    if (flag) {
        const bytes = await CryptoJS.AES.decrypt(data, process.env.PASSWORD_SECRET_KEY)
        console.log(bytes)
        responseData = bytes.toString(CryptoJS.enc.Utf8)
    } else {
        responseData = await CryptoJS.AES.encrypt(data, process.env.PASSWORD_SECRET_KEY).toString()
    }
    console.log(responseData)
    return responseData
}
