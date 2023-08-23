// eslint-disable-next-line import/no-extraneous-dependencies
const fetch = require('node-fetch')
const stripe = require('stripe')('sk_test_51NSrthFdWS7wL4EMgIaIlyzCIPY2387pcfibXJdCWsVJWg1dHrjAHZIoeKTrOCNcUNqkAmEuGNQti3q0mcE3hThb00CCZpfg5S')

// Make sure to have the 'node-fetch' library installed using npm or yarn.
async function verifyRecaptcha(req, res, next) {
    try {
        // const account = await stripe.accounts.create({
        //     type: 'standard',
        //     country: 'CA',
        //     email: '',
        // })
        // const accountLink = await stripe.accountLinks.create({
        //     account: 'acct_',
        //     refresh_url: 'https://theauctioncollective.com/',
        //     return_url: 'https://theauctioncollective.com/',
        //     type: 'account_onboarding',
        // })
        const accountLink = await stripe.paymentIntents.create({
            payment_method_types: ['card'],
            amount: 6000,
            currency: 'gbp',
            application_fee_amount: 200,
            transfer_data: {
                destination: 'acct_1NhXFuC14PIGoJjg',
            },
        });
        // const payout = await stripe.payouts.create(
        //     {
        //         amount: 1000,
        //         currency: 'gbp',
        //     },
        //     {
        //         stripeAccount: 'acct_1NSrthFdWS7wL4EM',
        //     }
        // );
        console.log('account', accountLink)
    } catch (error) {
        console.log(error)
    // Handle any error that occurs during verification
    // You may want to send an error response or redirect to an error page.
    }
}
verifyRecaptcha() // Call the function to execute the verification.
// Set your secret key. Remember to switch to your live secret key in production.
// See your keys here: https://dashboard.stripe.com/apikeys
// const stripe = require('stripe')('');

// const session = await stripe.checkout.sessions.create({
//     mode: 'payment',
//     line_items: [
//         {
//             price: 'akcalncnac',
//             quantity: 1,
//         },
//     ],
//     payment_intent_data: {
//         application_fee_amount: 123,
//         transfer_data: {
//             destination: 'acct_,
//         },
//     },
//     success_url: 'https://example.com/success',
//     cancel_url: 'https://example.com/cancel',
// });
// console.log(session);