/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */

const stripe = require('stripe')('sk_test_51NSrthFdWS7wL4EMgIaIlyzCIPY2387pcfibXJdCWsVJWg1dHrjAHZIoeKTrOCNcUNqkAmEuGNQti3q0mcE3hThb00CCZpfg5S')

module.exports.splitPayment = async (event) => {
    try {
        const accountLink = await stripe.paymentIntents.create({
            payment_method_types: ['card'],
            amount: 1000,
            currency: 'usd',
            application_fee_amount: 200,
            transfer_data: {
                destination: 'acct_1NgRdqCH5bk9pcaE',
            },
        })
        body = JSON.stringify({
            message: 'Success',
            data: accountLink,
        })
        return {
            headers: await helpers.getHeaders(),
            statusCode: 200,
            body,
        }
    } catch (error) {
        console.log(error)
        body = JSON.stringify({
            message: 'Failed to update information',
        })
        return {
            headers: await helpers.getHeaders(),
            statusCode: 400,
            body,
        }
    }
}
