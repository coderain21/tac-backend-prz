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

config.update({
    region: 'eu-west-2',
    accessKeyId: 'AKIA5QZYLFWFE6TXB756',
    secretAccessKey: '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',
})

/* The `module.exports.getHeaders` function is exporting an object that contains the headers for an
HTTP response. These headers include: */
module.exports.getHeaders = () => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
})

/* The `module.exports.sendPinpointEmail` function is a function that sends an email using the AWS
Pinpoint service. It takes in four parameters: `destinationId`, `sourceId`, `templateData`, and
`templateArn`. */
module.exports.sendPinpointEmail = async (destinationId, sourceId, templateData, templateArn) => {
    console.log(templateArn, 'templateArn')
    if (!AWS.config.region) {
        AWS.config.update({
          region: 'eu-west-1'
        });
      }
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
    console.log(JSON.stringify(params), 'params')
    try {
        const response = await pinpoint.sendEmail(params).promise()
        console.log('Email sent successfully:', response)
    } catch (error) {
        console.error('Failed to send email:', error)
    }
}
