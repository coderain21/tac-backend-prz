/* eslint-disable camelcase */
/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-plusplus */

const AWS = require('aws-sdk')
const CryptoJS = require('crypto-js')


AWS.config.update({
    signatureVersion: 'v4',
    region: 'ap-south-1',
})

const { config, SES } = require('aws-sdk')

const awsSES = new SES()
config.update({ region: process.env.REGION })



module.exports.sendMail = async (url, emailTemplate, destination_address) => {
    try {
        try {
            const param = {
                Source: 'no-reply@deeplay.co',
                Template: emailTemplate,
                TemplateData: JSON.stringify({ url }),
                Destination: {
                    ToAddresses: [`${destination_address}`],
                },
            }
            const mail = await awsSES.sendTemplatedEmail(param).promise()
            if (mail) {
                return {
                    status: true,
                }
            }
            return {
                status: false,
            }
        } catch (err) {
            return err
        }
    } catch (err) {
        return err
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

