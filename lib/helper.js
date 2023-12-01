const { config, PinpointEmail } = require('aws-sdk')

// Explicitly set the region for Pinpoint
config.update({
    region: 'eu-west-2',
})

const pinpoint = new PinpointEmail()

module.exports.sendPinpointEmail = async (destinationId, sourceId, templateData, templateArn) => {
    console.log(destinationId, 'destinationId')

    const params = {
        Content: {
            Template: {
                TemplateArn: templateArn,
                TemplateData: templateData,
            },
        },
        FromEmailAddress: sourceId,
        Destination: {
            ToAddresses: ['sandhyashri@7edge.com'],
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
