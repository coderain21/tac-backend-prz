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
const Buyers = require('../entities/Buyers')
const Counter = require('../entities/Counter')
const AccessLogs = require('../entities/AccessLogs')
const mongoConnection = require('../lib/mongodb_helper')
const cognitoHelper = require('../lib/cognito_helper')
const helpers = require('../lib/helper')

// mongoConnection.connect()

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

        if (!identities) {
            console.log('Non-federated user. Skipping identities and access log creation.');
            return callback(null, event);
        }

        // Parse the identities string
        const parsedIdentities = JSON.parse(identities)

        // Extract providerName
        const providerName = parsedIdentities[0]?.providerName
        console.log('Provider Name:', providerName)

        const buyersCollection = db.collection(process.env.BUYER_COLLECTION)
        const getBuyer = await buyersCollection.findOne({ email_address: email })

        if (!getBuyer) {
            console.error('Buyer not found for email:', email)
            return callback(new Error('Buyer not found'))
        }

        console.log('getBuyer', getBuyer)

        // Combine first name and last name from getBuyer
        const name = `${getBuyer.first_name || ''} ${getBuyer.last_name || ''}`.trim()

        if (providerName === 'Google' || providerName === 'Facebook') {
            const accessLog = {
                actor_id: getBuyer.buyer_id,
                updated_by: {
                    type: 'Buyer',
                    name, // Use combined name
                    email_address: getBuyer.email_address,
                },
                section: {
                    name: 'Bidder Management',
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
