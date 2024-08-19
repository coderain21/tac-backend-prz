/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
// Handler for the Post Confirmation Lambda trigger
exports.handler = async (event, context) => {
    console.log(event)
    // const userEmail = event.request.userAttributes.email

    // try {
    //     await createMailchimpTemplate(userEmail)
    //     // Additional logic to handle post-confirmation actions...
    //     console.log('Mailchimp template creation completed.')
    // } catch (error) {
    //     console.error('Error creating Mailchimp template:', error)
    //     // Handle error appropriately...
    // }
}
