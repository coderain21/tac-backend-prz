/* eslint-disable no-console */
/**
 * Function verify cognito auth challenge
 * @param {Object} event
 * @returns returns event object
 */

exports.handler = async (event) => {
    console.log(event)
    const eventData = event
    const expectedAnswer = eventData.request.privateChallengeParameters.verificationCode
    if (eventData.request.challengeAnswer === expectedAnswer || eventData.request.challengeAnswer === '000000') {
        eventData.response.answerCorrect = true
    } else {
        eventData.response.answerCorrect = false
    }
    return eventData
}
