/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/**
 * This api used to fetch the template from the mailchimp server
 */
// eslint-disable-next-line import/extensions, import/no-unresolved
const mailchimpHelper = require('../lib/mailchimp_helper')
const helpers = require('../lib/helper')

// eslint-disable-next-line no-unused-vars
exports.handler = async (event, context) => {
    try {
        // Get template by name
        const templateName = event.pathParameters.template_name
        const defaultTemplate = event.body
        // Get template using helper
        let template = await mailchimpHelper.fetchMandrillTemplate(templateName)
        if (template) {
            return {
                statusCode: 200,
                headers: await helpers.getHeaders(),
                body: template,
            }
        // eslint-disable-next-line no-else-return
        } else {
            // this is for default template
            template = await mailchimpHelper.fetchMandrillTemplate(defaultTemplate)
            // Combine template data with the default flag
            const responseBody = { ...template, default: true }
            return {
                statusCode: 200,
                headers: await helpers.getHeaders(),
                body: responseBody,
            }
        }
    } catch (error) {
        if (error.status) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ error: error.message }),
            }
        }
        return {
            statusCode: 500,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ error: 'Internal Server Error' }),
        }
    }
}
