/* eslint-disable no-inner-declarations */
/* eslint-disable no-console */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-promise-executor-return */
/* eslint-disable no-use-before-define */
/* eslint-disable no-shadow */
/* eslint-disable no-unused-vars */
const AWS = require('aws-sdk')

const cognito = new AWS.CognitoIdentityServiceProvider()

exports.handler = (event, context, callback) => {
    console.log('event', event)
    try {
        function checkForExistingUsers(event, linkToExistingUser) {
            const params = {
                UserPoolId: event.userPoolId,
                AttributesToGet: ['sub', 'email'],
                Filter: `email = "${event.request.userAttributes.email}"`,
            }
            return new Promise((resolve, reject) => cognito.listUsers(params, (err, result) => {
                if (err) {
                    reject(err)
                    return
                }
                if (result && result.Users && result.Users[0] && result.Users[0].Username && linkToExistingUser) {
                    console.log('Found existing users: ', result.Users)
                    if (result.Users.length > 1) {
                        result.Users.sort((a, b) => ((a.UserCreateDate > b.UserCreateDate) ? 1 : -1))
                        console.log('Found more than one existing users. Ordered by createdDate: ', result.Users)
                    }
                    linkUser(result.Users[0].Username, event).then((result) => {
                        resolve(result)
                    })
                        .catch((error) => {
                            reject(err)
                        })
                } else {
                    resolve(result)
                }
            }))
        }

        function linkUser(sub, event) {
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

        if (event.triggerSource === 'PreSignUp_SignUp' || event.triggerSource === 'PreSignUp_AdminCreateUser') {
            checkForExistingUsers(event, false).then((result) => {
                if (result != null && result.Users != null && result.Users[0] != null) {
                    console.log('Found at least one existing account with that email address: ', result)
                    console.log('Rejecting sign-up')
                    // prevent sign-up
                    callback('An external provider account alreadys exists for that email address', null)
                } else {
                    // proceed with sign-up
                    callback(null, event)
                }
            })
                .catch((error) => {
                    console.log('Error checking for existing users: ', error)
                    // proceed with sign-up
                    callback(null, event)
                })
        }

        if (event.triggerSource === 'PreSignUp_ExternalProvider') {
            checkForExistingUsers(event, true).then((result) => {
                console.log('Completed looking up users and linking them: ', result)
                callback(null, event)
            })
                .catch((error) => {
                    console.log('Error checking for existing users: ', error)
                    // proceed with sign-up
                    callback(null, event)
                })
        }
    } catch (err) {
        console.log(err)
    }
}
