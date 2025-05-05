/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/**
 * This API fetches templates from the Mailchimp server
 */

const mongoConnection = require('../lib/mongodb_helper')
const Users = require('../entities/Users')
const mailchimpHelper = require('../lib/mailchimp_helper')
const helpers = require('../lib/helper')

let connection = null

exports.handler = async (event) => {
    // Get template name from path parameters
    const templateName = event.pathParameters.template_name
    const defaultTemplateName = event.queryStringParameters?.default_template
    const templateIdPrefix = templateName.split('-')[0]
    const headers = await helpers.getHeaders()

    if (connection === null || !connection.readyState) {
        console.log('not coonected')
        connection = await mongoConnection.connect()
    }

    try {
        const emailAddress = event.requestContext.authorizer.claims.email
        const getUser = await mongoConnection.view(Users, { email_address: emailAddress })
        const user = getUser[0]
        // Check if user exists and has _id
        // eslint-disable-next-line no-underscore-dangle
        if (!user || !user._id) {
            return {
                headers,
                statusCode: 403,
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

        // Compare user ID with template prefix
        // eslint-disable-next-line no-underscore-dangle
        if (user._id.toString() !== templateIdPrefix) {
            return {
                headers,
                statusCode: 403,
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }
        if (!emailAddress) {
            return {
                headers,
                statusCode: 403,
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }
    } catch (error) {
        return {
            headers,
            statusCode: 403,
            body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
        }
    }

    try {
        // Try to fetch the requested template
        const template = await mailchimpHelper.fetchMandrillTemplate(templateName)
        return {
            statusCode: 200,
            headers,
            body: template, // Assuming mailchimpHelper returns the template in the proper format
        }
    } catch (error) {
        // If the template is not found and a default template is specified, try that instead
        if (error.response?.status === 404 && defaultTemplateName) {
            try {
                // Fetch the default template
                const fallbackTemplate = await mailchimpHelper.fetchMandrillTemplate(defaultTemplateName)

                // Return the fallback template directly without stringifying
                return {
                    statusCode: 200,
                    headers: {
                        ...headers,
                        'X-Default-Template': 'true', // Add header to indicate this is the default template
                    },
                    body: fallbackTemplate,
                }
            } catch (fallbackError) {
                console.error(`Failed to fetch default template '${defaultTemplateName}':`, fallbackError.message)
                return {
                    statusCode: 404,
                    headers,
                    body: `Neither '${templateName}' nor fallback template found`,
                }
            }
        }

        // Handle other errors
        console.error(`Error fetching template '${templateName}':`, error.message)
        return {
            statusCode: error.response?.status || 500,
            headers,
            body: `Error fetching template: ${error.message}`,
        }
    }
}
