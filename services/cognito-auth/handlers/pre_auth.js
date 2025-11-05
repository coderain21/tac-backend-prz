/* eslint-disable camelcase */
/* eslint-disable no-inner-declarations */
/* eslint-disable no-plusplus */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-shadow */
/* eslint-disable consistent-return */
/* eslint-disable no-useless-catch */
/* eslint-disable no-use-before-define */
/* eslint-disable no-unused-vars */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-promise-executor-return */
/* eslint-disable no-console */

const { ObjectId } = require('mongodb')
const mongoHelper = require('../lib/mongodb_helper')

exports.handler = async (event) => {
    try {
        const email = event.request.userAttributes.email
        const isFederatedLogin = event.request.userAttributes.identities

        let auction_id
        if (isFederatedLogin) {
            // For federated login, try to find by email first, then by any available record
            let tempAuth = await mongoHelper.getOrder(
                process.env.MONGO_CLIENT,
                process.env.DATABASE,
                'temp_federated_auth',
                { email_address: email },
            )

            // If not found by email, try to find any recent record and update it
            if (!tempAuth) {
                tempAuth = await mongoHelper.getOrder(
                    process.env.MONGO_CLIENT,
                    process.env.DATABASE,
                    'temp_federated_auth',
                    {},
                    { created_at: -1 }, // Get most recent
                )

                if (tempAuth) {
                    // Update with email for future reference
                    await mongoHelper.updateCart(
                        process.env.MONGO_CLIENT,
                        process.env.DATABASE,
                        'temp_federated_auth',
                        // eslint-disable-next-line no-underscore-dangle
                        { _id: tempAuth._id },
                        { email_address: email },
                    )
                }
            }

            auction_id = tempAuth?.auction_id
            if (!auction_id) {
                console.log('No auction_id found for federated login, allowing login to proceed')
                return event
            }
        } else {
            auction_id = event.request.validationData?.auction_id
            if (!auction_id) {
                throw new Error('Missing auction_id')
            }
        }

        // Rest of your existing logic...
        const auction = await mongoHelper.getOrder(
            process.env.MONGO_CLIENT,
            process.env.DATABASE,
            process.env.AUCTION_MONGODB_COLLECTION_NAME,
            { _id: new ObjectId(auction_id) },
        )

        if (!auction?.seller_email) {
            throw new Error('Auction not found')
        }

        // Check if buyer record exists with seller_email
        const existingBuyer = await mongoHelper.getOrder(
            process.env.MONGO_CLIENT,
            process.env.DATABASE,
            process.env.BUYER_COLLECTION,
            { email_address: email, seller_email: auction.seller_email },
        )

        if (!existingBuyer) {
            const buyerWithoutSeller = await mongoHelper.getOrder(
                process.env.MONGO_CLIENT,
                process.env.DATABASE,
                process.env.BUYER_COLLECTION,
                { email_address: email, registered_through: 'federated' },
            )

            if (buyerWithoutSeller && !buyerWithoutSeller.seller_email) {
                await mongoHelper.updateCart(
                    process.env.MONGO_CLIENT,
                    process.env.DATABASE,
                    process.env.BUYER_COLLECTION,
                    { _id: buyerWithoutSeller._id },
                    { seller_email: auction.seller_email, registered_through: '' },
                )
            } else if (!buyerWithoutSeller) {
                await mongoHelper.createOrder(
                    process.env.MONGO_CLIENT,
                    process.env.DATABASE,
                    process.env.BUYER_COLLECTION,
                    {
                        user_type: 'buyer',
                        password: '',
                        email_address: email,
                        newsletter_notification: false,
                        seller_email: auction.seller_email,
                        terms_and_condition: true,
                        first_name: '',
                        last_name: '',
                    },
                )
            }
        }

        return event
    } catch (error) {
        console.error(error)
        throw new Error('Authentication failed')
    }
}
