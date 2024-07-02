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
const mailchimp = require('@mailchimp/mailchimp_transactional')

const cognito = new AWS.CognitoIdentityServiceProvider()
const Users = require('../entities/Users')
const SubDomain = require('../entities/SubDomain')
const mongoConnection = require('../lib/mongodb_helper')
const Counter = require('../entities/Counter')
const helpers = require('../lib/helper')
const cognitoHelper = require('../lib/cognito_helper')
const mailchimpHelper = require('../lib/mailchimp_helper')

let connection = null

// Initialize Mailchimp Transactional
const mailchimpClient = mailchimp(process.env.MAILCHIMP_TRANSACTIONAL_API_KEY)

async function addGroup(username, userPoolId) {
    try {
        const response = await cognito.createGroup({
            GroupName: username,
            UserPoolId: userPoolId,
        }).promise()
        return {
            success: true,
        }
    } catch (error) {
        console.error('Error creating group:', error.GroupExistsException)
        return {
            success: true,
        }
    }
}

async function linkUser(sub, event) {
    try {
        let destinationProvider = 'Cognito'
        let destinationSub = sub
        if (sub.includes('_')) {
            destinationProvider = sub.split('_')[0]
            destinationSub = sub.split('_')[1]
        }
        const params = {
            DestinationUser: {
                ProviderAttributeValue: destinationSub,
                ProviderName: destinationProvider,
            },
            SourceUser: {
                ProviderAttributeName: 'Cognito_Subject',
                ProviderAttributeValue: event.userName.split('_')[1],
                ProviderName: event.userName.split('_')[0],
            },
            UserPoolId: event.userPoolId,
        }
        const linkProvider = await cognito.adminLinkProviderForUser(params).promise()
        return linkProvider
    } catch (err) {
        console.log('link errrr', err)
    }
}

async function checkForExistingUsers(event, linkToExistingUser) {
    try {
        const params = {
            UserPoolId: event.userPoolId,
            AttributesToGet: ['sub', 'email'],
            Filter: `email = "${event.request.userAttributes.email}"`,
        }

        const result = await new Promise((resolve, reject) => cognito.listUsers(params, (err, data) => {
            if (err) {
                reject(err)
                return
            }
            resolve(data)
        }))

        if (result.Users && result.Users.length > 0 && result.Users[0].Username && linkToExistingUser) {
            if (result.Users.length > 1) {
                result.Users.sort((a, b) => ((a.UserCreateDate > b.UserCreateDate) ? 1 : -1))
            }
            await linkUser(result.Users[0].Username, event)
            return result
        }
        let newPassword = process.env.SELLER_GOOGLE_PASSWORD
        newPassword = await CryptoJS.AES.encrypt(newPassword, process.env.PASSWORD_SECRET_KEY).toString()
        const counter = await Counter.findOneAndUpdate({ record_type: 'Seller', status: 'Active' }, { $inc: { starting_sequence: 1 } }, { new: true, upsert: true }).exec()
        const sequenceNumber = `S${helpers.leftPad(counter.starting_sequence, 4)}`

        const userData = {
            first_name: event.request.userAttributes.given_name,
            last_name: event.request.userAttributes.family_name,
            full_name: `${event.request.userAttributes.given_name} ${event.request.userAttributes.family_name}`,
            user_name: event.request.userAttributes.email,
            email_address: event.request.userAttributes.email,
            password: newPassword,
            is_first_time_login: true,
            user_type: 'seller',
            seller_id: sequenceNumber,
        }
        const domainInfo = {
            seller_email: event.request.userAttributes.email,
            subdomain: process.env.DEFAULT_SUB_DOMAIN,
            default: true,
            client_id: process.env.DEFAULT_CLIENT_ID,
            group_name: event.request.userAttributes.email.split('@')[0],
        }
        const addToGroup = await addGroup(event.request.userAttributes.email.split('@')[0], process.env.DEFAULT_USERPOOL_ID)
        const cognitoResponse = await cognitoHelper.cognitoCreate(userData)
        if (cognitoResponse) {
            // const user = await mongoConnection.save(userData, Users)
            const user = await Users.findOneAndUpdate(
                { email_address: userData.email_address }, // Filter
                { ...userData }, // Update fields
                { new: true, upsert: true, setDefaultsOnInsert: true }, // Options
            )
            const domain = await mongoConnection.save(domainInfo, SubDomain)
            await linkUser(event.request.userAttributes.email, event)
            return { user, domain }
        }
        return false
    } catch (error) {
        console.error('Error in checkForExistingUsers:', error)
        throw error
    }
}

exports.handler = async (event, context, callback) => {
    if (event.triggerSource === 'PreSignUp_ExternalProvider') {
        try {
            if (connection === null || !connection.readyState) {
                console.log('not connected')
                connection = await mongoConnection.connect()
            }
            const result = await checkForExistingUsers(event, true)
            const userData = {
                email_address: result.user.email_address,
                seller_id: result.user.seller_id,
            }
            const mailChimpCreation = await mailchimpHelper.createTemplate(userData)
            callback(null, event)
        } catch (error) {
            // In case of error, we should probably not proceed with sign-up
            callback(error)
        } finally {
            // Disconnect from the MongoDB database
            if (connection) {
                await connection.disconnect()
            }
        }
    } else {
        callback(null, event)
    }
}
