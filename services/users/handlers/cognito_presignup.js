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
const Users = require('../entities/Users')
const mongoConnection = require('../lib/mongodb_helper')
const cognitoHelper = require('../lib/cognito_helper')

function generateRandomPassword(length) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let password = ''

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length)
        password += charset.charAt(randomIndex)
    }

    return password
}

exports.handler = async (event, context, callback) => {
    async function checkForExistingUsers(event, linkToExistingUser) {
        console.log('Executing checkForExistingUsers')

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
                console.log('Found existing users: ', result.Users)
                if (result.Users.length > 1) {
                    result.Users.sort((a, b) => ((a.UserCreateDate > b.UserCreateDate) ? 1 : -1))
                    console.log('Found more than one existing users. Ordered by createdDate: ', result.Users)
                }
                await linkUser(result.Users[0].Username, event)
                return result
            }
            let newPassword = generateRandomPassword(10) // Change the length as needed
            newPassword = await CryptoJS.AES.encrypt(newPassword, process.env.PASSWORD_SECRET_KEY).toString()

            const userData = {
                user_name: event.request.userAttributes.email,
                email_address: event.request.userAttributes.email,
                password: newPassword,
                is_first_time_login: true,
                user_type: 'seller',
            }
            const connection = await mongoConnection.connect()
            const user = await mongoConnection.save(userData, Users)
            console.log(user)
            const cognitoResponse = await cognitoHelper.cognitoCreate(userData)
            console.log(cognitoResponse)
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
            console.log('Successfully linked users.')
            resolve(result)
        }))
    }

    console.log(JSON.stringify(event))

    if (event.triggerSource === 'PreSignUp_ExternalProvider') {
        try {
            const result = await checkForExistingUsers(event, true)
            console.log('Completed looking up users and linking them: ', result)
            callback(null, event)
        } catch (error) {
            console.log('Error checking for existing users: ', error)
            // proceed with sign-up
            callback(null, event)
        }
    } else {
        callback(null, event)
    }
}
