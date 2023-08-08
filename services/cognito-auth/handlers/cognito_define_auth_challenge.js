/* eslint-disable no-console */
/**
 * fucntion to get challenge name based on client id
 * @param {Object} event
 * @returns challnge name based on client id
 */
function getChallnegeName(event) {
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
    console.log(event)
    if (event.request.userNotFound) {
        callback('User does not exist', event)
    }
    const eventData = event
    if (eventData.request.session && eventData.request.session.length === 1
        && eventData.request.session[0].challengeName === 'SRP_A'
        && eventData.request.session[0].challengeResult === true) {
        /* SRP_A is the first challenge, this will be implemented by cognito. Set next challenge as PASSWORD_VERIFIER. */
        eventData.response.issueTokens = false
        eventData.response.failAuthentication = false
        eventData.response.challengeName = getChallnegeName(event)
    } else if (eventData.request.session && eventData.request.session.length === 2
        && eventData.request.session[1].challengeName === 'PASSWORD_VERIFIER'
        && eventData.request.session[1].challengeResult === true) {
        /* If password verification is successful then set next challenge as CUSTOM_CHALLENGE. */
        eventData.response.issueTokens = false
        eventData.response.failAuthentication = false
        eventData.response.challengeName = 'CUSTOM_CHALLENGE'
    } else if (eventData.request.session && eventData.request.session.length >= 5
        && eventData.request.session.slice(-1)[0].challengeName === 'CUSTOM_CHALLENGE'
        && eventData.request.session.slice(-1)[0].challengeResult === false) {
        /* The user has exhausted 3 attempts to enter correct otp. */
        eventData.response.issueTokens = false
        eventData.response.failAuthentication = true
    } else if (eventData.request.session && eventData.request.session.length > 0 && eventData.request.session.slice(-1)[0].challengeName === 'CUSTOM_CHALLENGE'
        && eventData.request.session.slice(-1)[0].challengeResult === true) {
        /* User entered the correct OTP. Issue tokens. */
        eventData.response.issueTokens = true
        eventData.response.failAuthentication = false
    } else {
        /* User did not provide a correct answer yet. */
        eventData.response.issueTokens = false
        eventData.response.failAuthentication = false
        eventData.response.challengeName = 'CUSTOM_CHALLENGE'
    }
    callback(null, eventData)
}
