/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
// Handler for the Post Confirmation Lambda trigger
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
const CryptoJS = require('crypto-js')
const uuid = require('uuid')
const AWS = require('aws-sdk')

const cognito = new AWS.CognitoIdentityServiceProvider()
const { get } = require('request')
const Sellers = require('../entities/Users')
const Counter = require('../entities/Counter')
const AccessLogs = require('../entities/AccessLogs')
const mongoConnection = require('../lib/mongodb_helper')
const cognitoHelper = require('../lib/cognito_helper')
const helpers = require('../lib/helper')

exports.handler = async (event, context, callback) => {
    let connection // Define the connection variable here
    try {
        console.log('event', JSON.stringify(event))

        // Connect to MongoDB
        connection = await mongoConnection.connect()
        console.log('connection', connection)

        const db = connection.connection.db // Accessing the database
        console.log('Database connected')

        const email = event.request.userAttributes.email
        const identities = event.request.userAttributes.identities
        const name = `${event.request.userAttributes.given_name} ${event.request.userAttributes.family_name}`

        if (!identities) {
            console.log('Non-federated user. Skipping identities and access log creation.');
            return callback(null, event);
        }

        // Parse the identities string
        const parsedIdentities = JSON.parse(identities)

        // Extract providerName
        const providerName = parsedIdentities[0]?.providerName
        console.log('Provider Name:', providerName)

        const userCollection = db.collection(process.env.MONGODB_COLLECTION_NAME)
        const getSeller = await userCollection.findOne({ email_address: email })

        if (!getSeller) {
            console.error('Seller not found for email:', email)
            return callback(new Error('Seller not found'))
        }

        console.log('getSeller', getSeller)

        // Combine first name and last name from getBuyer

        if (providerName === 'Google' || providerName === 'Facebook') {
            const accessLog = {
                actor_id: getSeller.seller_id,
                updated_by: {
                    type: 'Seller',
                    name, // Use combined name
                    email_address: getSeller.email_address,
                },
                section: {
                    name: 'Seller Management',
                    action: 'Login',
                },
                updated_at: Date.now(), // Convert to epoch (seconds)
            }

            console.log('Access Log:', accessLog)

            // Save the access log
            const accessLogsCollection = db.collection(process.env.ACCESS_LOG_COLLECTION)
            await accessLogsCollection.insertOne(accessLog)

            console.log('Access log saved successfully')
        }

        callback(null, event)
    } catch (error) {
        console.error('Error in handler:', error)
        callback(error)
    } finally {
        // Ensure MongoDB connection is closed
        if (connection) {
            await connection.disconnect()
            console.log('MongoDB connection closed')
        }
    }
}
