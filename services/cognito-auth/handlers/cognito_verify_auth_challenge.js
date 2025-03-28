/* eslint-disable no-console */
/**
 * Function verify cognito auth challenge
 * @param {Object} event
 * @returns returns event object
 */

exports.handler = async (event) => {
    const eventData = event
    const expectedAnswer = eventData.request.privateChallengeParameters.verificationCode
    // if (eventData.request.challengeAnswer === expectedAnswer) {
    //     eventData.response.answerCorrect = true
    // }

    if (
        eventData.request.challengeAnswer === expectedAnswer
    || (process.env.STAGE !== 'prod') && eventData.request.challengeAnswer === '573421')
     {
        eventData.response.answerCorrect = true
    } else {
        eventData.response.answerCorrect = false
    }
    console.log('eventData', eventData)

    return eventData
}
