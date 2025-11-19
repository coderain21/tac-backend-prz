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

        // Skip federated users
        if (isFederatedLogin) {
            return event
        }

        // Skip password update operations
        const isPasswordUpdate = event.request.validationData?.is_password_update
        if (isPasswordUpdate) {
            return event
        }

        const auction_id = event.request.validationData?.auction_id
        if (!auction_id) {
            throw new Error('Missing auction_id')
        }

        // Fetch seller email from auction
        const auction = await mongoHelper.getOrder(
            process.env.MONGO_CLIENT,
            process.env.DATABASE,
            process.env.AUCTION_MONGODB_COLLECTION_NAME,
            { _id: new ObjectId(auction_id) },
        )

        if (!auction?.seller_email) {
            throw new Error('Auction not found')
        }

        const seller_email = auction.seller_email

        // Check if buyer already exists with this seller_email
        const existingBuyer = await mongoHelper.getOrder(
            process.env.MONGO_CLIENT,
            process.env.DATABASE,
            process.env.BUYER_COLLECTION,
            { email_address: email, seller_email },
        )

        if (!existingBuyer) {
            // Check if user has existing record (any record for this email)
            const buyerData = await mongoHelper.getOrder(
                process.env.MONGO_CLIENT,
                process.env.DATABASE,
                process.env.BUYER_COLLECTION,
                { email_address: email },
            )

            if (buyerData) {
                // Copy existing data and add seller_email
                const newBuyerData = { ...buyerData }
                // eslint-disable-next-line no-underscore-dangle
                delete newBuyerData._id
                newBuyerData.seller_email = seller_email

                await mongoHelper.createOrder(
                    process.env.MONGO_CLIENT,
                    process.env.DATABASE,
                    process.env.BUYER_COLLECTION,
                    newBuyerData,
                )
            } else {
                // Create new buyer record
                await mongoHelper.createOrder(
                    process.env.MONGO_CLIENT,
                    process.env.DATABASE,
                    process.env.BUYER_COLLECTION,
                    {
                        user_type: 'buyer',
                        password: '',
                        email_address: email,
                        newsletter_notification: false,
                        seller_email,
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
