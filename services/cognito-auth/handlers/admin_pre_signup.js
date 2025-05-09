// eslint-disable-next-line no-unused-vars
exports.handler = async (event, context, callback) => {
    const trigger = event.triggerSource

    // Allow only AdminCreateUser, block SignUp
    if (trigger === 'PreSignUp_SignUp') {
        throw new Error('Sign-up is disabled. Contact admin.')
    }

    // Allow other triggers (AdminCreateUser, etc.)
    return event
}
