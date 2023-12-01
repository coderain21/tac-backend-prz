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

/* The `module.exports.getHeaders` function is exporting an object that contains the headers for an
HTTP response. These headers include: */
module.exports.getHeaders = () => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
})

/* The `module.exports.leftPad` function is a utility function that pads a number with leading zeros to
a specified length. */
module.exports.leftPad = (number, targetLength) => {
    let output = `${number}`
    while (output.length < targetLength) {
        output = `0${output}`
    }
    return output
}

/* The `module.exports.sendPinpointEmail` function is a function that sends an email using the AWS
Pinpoint service. It takes in four parameters: `destinationId`, `sourceId`, `templateData`, and
`templateArn`. */
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

/* The `module.exports.encryptDecryptPassword` function is a utility function that encrypts or decrypts
a password using the AES encryption algorithm from the CryptoJS library. */
/* The `module.exports.encryptDecryptPassword` function is a utility function that encrypts or decrypts
a password using the AES encryption algorithm from the CryptoJS library. */
module.exports.encryptDecryptPassword = async (data, flag) => {
    console.log(data, flag)
    let responseData
    if (flag) {
        const decryptedBytes = CryptoJS.AES.decrypt(responseData, process.env.PASSWORD_SECRET_KEY).toString(CryptoJS.enc.Utf8)
        console.log('decryptedBytes', decryptedBytes)
        return decryptedBytes
    }
    responseData = await CryptoJS.AES.encrypt(data, process.env.PASSWORD_SECRET_KEY).toString()
    console.log(responseData)
    return responseData
}
