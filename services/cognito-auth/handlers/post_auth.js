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
const mongoConnection = require('../lib/mongodb_helper')

// mongoConnection.connect()

exports.handler = async (event, context, callback) => {
    let connection
    try {
        console.log('event', JSON.stringify(event))

        // Early returns for special cases
        if (event.username?.startsWith('GOOGLE_')) {
            console.log('First time Login using google')
            return callback(null, event)
        }

        const { email, identities } = event.request.userAttributes

        if (!identities) {
            console.log('Non-federated user. Skipping identities and access log creation.')
            return callback(null, event)
        }

        // Connect to MongoDB only if needed
        connection = await mongoConnection.connect()
        const db = connection.connection.db

        // Parse identities and get provider
        const providerName = JSON.parse(identities)[0]?.providerName
        if (!['Google', 'Facebook'].includes(providerName)) {
            return callback(null, event)
        }

        // Get buyer info
        const buyersCollection = db.collection(process.env.BUYER_COLLECTION)
        const buyer = await buyersCollection.findOne({ email_address: email })

        if (!buyer) {
            console.error('Buyer not found for email:', email)
            return callback(new Error('Buyer not found'))
        }

        // Create and save access log
        const name = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim()
        const accessLog = {
            actor_id: buyer.buyer_id,
            updated_by: {
                type: 'Buyer',
                name,
                email_address: buyer.email_address,
            },
            section: {
                name: 'Bidder Management',
                action: 'Login',
            },
            updated_at: Date.now(),
        }

        await db.collection(process.env.ACCESS_LOG_COLLECTION)
            .insertOne(accessLog)

        return callback(null, event)
    } catch (error) {
        console.error('Error in handler:', error)
        return callback(error)
    } finally {
        if (connection) {
            await connection.disconnect()
        }
    }
}
