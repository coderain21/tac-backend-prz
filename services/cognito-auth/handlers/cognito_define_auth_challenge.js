/* eslint-disable no-param-reassign */
/* eslint-disable no-console */
/**
 * fucntion to get challenge name based on client id
 * @param {Object} event
 * @returns challnge name based on client id
 */
const AWS = require('aws-sdk')

const cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider()

function getChallnegeName(event) {
    console.log(event)
    let chanllengeName = 'PASSWORD_VERIFIER'
    if (event.callerContext.clientId === process.env.COGNITO_MOBILE_CLIENT_ID) {
        chanllengeName = 'CUSTOM_CHALLENGE'
    }
    return chanllengeName
}

/**
  * Function define cognito auth challenge
  * @param {Object} event
  * @param {Object} _context
  * @param {Object} callback
  * @returns returns event object
  */
exports.handler = async (event, _context, callback) => {
    console.log(JSON.stringify(event))
    if (event.request.userNotFound) {
        callback('User does not exist', event)
    }
    if (event.request.userAttributes.phone_number_verified && event.request.userAttributes.phone_number_verified === 'false') {
        callback('User is not confirmed', event)
    }
    const params = {
        UserPoolId: event.userPoolId, /* required */
        Username: event.userName, /* required */
    }
    cognitoidentityserviceprovider.adminGetUser(params, (err, data) => {
        if (err) console.log(err, err.stack) // an error occurred
        else {
            console.log(data.Enabled)
            if (data.Enabled === false) {
                event.response.failAuthentication = true
                console.log(event)
                callback('User is deactivated', event)
            }
        } // successful response
    })
    const eventData = event
    if (eventData.request.session && eventData.request.session.length === 1
         && eventData.request.session[0].challengeName === 'SRP_A'
         && eventData.request.session[0].challengeResult === true) {
        console.log('block1')
        /* SRP_A is the first challenge, this will be implemented by cognito. Set next challenge as PASSWORD_VERIFIER. */
        eventData.response.issueTokens = false
        eventData.response.failAuthentication = false
        eventData.response.challengeName = getChallnegeName(event)
    } else if (eventData.request.session && eventData.request.session.length === 2
         && eventData.request.session[1].challengeName === 'PASSWORD_VERIFIER'
         && eventData.request.session[1].challengeResult === true) {
        console.log('block2')
        /* If password verification is successful then set next challenge as CUSTOM_CHALLENGE. */
        eventData.response.issueTokens = false
        eventData.response.failAuthentication = false
        eventData.response.challengeName = 'CUSTOM_CHALLENGE'
    } else if (eventData.request.session && eventData.request.session.length >= 5
         && eventData.request.session.slice(-1)[0].challengeName === 'CUSTOM_CHALLENGE'
         && eventData.request.session.slice(-1)[0].challengeResult === false) {
        console.log('block3')
        /* The user has exhausted 3 attempts to enter correct otp. */
        eventData.response.issueTokens = false
        eventData.response.failAuthentication = true
    } else if (eventData.request.session && eventData.request.session.length > 0 && eventData.request.session.slice(-1)[0].challengeName === 'CUSTOM_CHALLENGE'
         && eventData.request.session.slice(-1)[0].challengeResult === true) {
        console.log('block4')
        /* User entered the correct OTP. Issue tokens. */
        eventData.response.issueTokens = true
        eventData.response.failAuthentication = false
    } else {
        console.log('block5')
        /* User did not provide a correct answer yet. */
        eventData.response.issueTokens = false
        eventData.response.failAuthentication = false
        eventData.response.challengeName = 'CUSTOM_CHALLENGE'
    }
    callback(null, eventData)
}
