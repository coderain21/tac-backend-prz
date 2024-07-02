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
const Users = require('../entities/Buyers')
const mongoConnection = require('../lib/mongodb_helper')
const cognitoHelper = require('../lib/cognito_helper')

exports.handler = async (event, context, callback) => {
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
                    console.log('Found more than one existing users. Ordered by createdDate: ', result.Users)
                }
                await linkUser(result.Users[0].Username, event)
                return result
            }
            let newPassword = process.env.SELLER_GOOGLE_PASSWORD// Change the length as needed
            newPassword = await CryptoJS.AES.encrypt(newPassword, process.env.PASSWORD_SECRET_KEY).toString()
            const userData = {
                first_name: event.request.userAttributes.given_name,
                last_name: event.request.userAttributes.family_name,
                full_name: `${event.request.userAttributes.given_name} ${event.request.userAttributes.family_name}`,
                registered_through: 'federated',
                email_address: event.request.userAttributes.email,
                password: newPassword,
                terms_and_condition: true,
                user_type: 'buyer',
                newsletter_notification: false,

            }
            const connection = await mongoConnection.connect()
            const user = await mongoConnection.save(userData, Users)
            const cognitoResponse = await cognitoHelper.buyerCognitoCreate(userData, event.userPoolId)
            await connection.disconnect()
            await linkUser(event.request.userAttributes.email, event)
        } catch (error) {
            throw error
        }
    }

    function linkUser(sub, event) {
        console.log(`Linking user accounts with target sub: ${sub}and event: `, event)

        // By default, assume the existing account is a Cognito username/password
        let destinationProvider = 'Cognito'
        let destinationSub = sub
        // If the existing user is in fact an external user (Xero etc), override the the provider
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
        console.log('Parameters for adminLinkProviderForUser: ', params)
        return new Promise((resolve, reject) => cognito.adminLinkProviderForUser(params, (err, result) => {
            if (err) {
                console.log('Error encountered whilst linking users: ', err)
                reject(err)
                return
            }

            console.log('Successfully linked users.', result)
            return resolve(result)
        }))
    }
    console.log('event', JSON.stringify(event))

    if (event.triggerSource === 'PreSignUp_ExternalProvider') {
        try {
            const result = await checkForExistingUsers(event, true)
            callback(null, event)
        } catch (error) {
            console.log('Error checking for existing users: ', error)
            // proceed with sign-up
            callback(null, event)
        }
    } else {
        console.log('elseeee')
        callback(null, event)
    }
}
