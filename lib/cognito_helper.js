/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/no-extraneous-dependencies */
const { CognitoIdentityServiceProvider } = require('aws-sdk')

const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider()

/* This code exports a function named `cognitoResetPassword` that takes an object `userParams` as a
parameter. The function uses the AWS SDK to reset the password of a user in a Cognito user pool. It
sets the new password provided in `userParams`, along with the user pool ID and username. The
`Permanent` parameter is set to `true` to indicate that the user must change their password after
the next login. The function returns an object with a `status` property indicating whether the
password reset was successful, and a `data` property containing the response from the Cognito
service. The function is marked as `async` to allow for the use of `await` when calling the
`adminSetUserPassword` method, which returns a promise. */

module.exports.cognitoResetPassword = async (userData) => {
    try {
        const params = {
            Password: userData.new_password, /* required */
            UserPoolId: process.env.COGNITO_USER_POOL_ID, /* required */
            Username: userData.email, /* required */
            Permanent: true,
        }
        console.log(params)
        const restPassword = await cognitoIdentityServiceProvider.adminSetUserPassword(params).promise()
        if (restPassword) {
            return {
                status: true,
                data: restPassword,
            }
        }
        return {
            status: false,
        }
    } catch (error) {
        throw new Error(error)
    }
}

/* This code exports a function named `updateUserCustomAttributes` that takes two parameters:
`username` and `customAttributes`. The function uses the AWS SDK to update the custom attributes of
a user in a Cognito user pool. It sets the user pool ID and username provided in `username`, along
with the custom attributes provided in `customAttributes`. The function maps the `customAttributes`
array to an array of objects with `Name` and `Value` properties, which are used to update the user's
custom attributes. The function returns nothing, but logs a message to the console indicating
whether the custom attributes were updated successfully or if there was an error. The function is
marked as `async` to allow for the use of `await` when calling the `adminUpdateUserAttributes`
method, which returns a promise. */
module.exports.updateUserCustomAttributes = async (username, customAttributes) => {
    console.log('custom', customAttributes)
    const params = {
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: username,
        UserAttributes: customAttributes.map((attribute) => ({
            Name: attribute.name,
            Value: attribute.value,
        })),
    }
    console.log(params)
    try {
        await cognitoIdentityServiceProvider.adminUpdateUserAttributes(params).promise()
        return { success_status: true }
    } catch (error) {
        console.error('Error updating custom attributes:', error)
        return { success_status: false, message: error.message }
    }
}

/* This code exports a function named `activateDeactivateUser` that takes two parameters: `username`
and `status`. The function uses the AWS SDK to activate or deactivate a user in a Cognito user pool
based on the `status` parameter. It sets the user pool ID and username provided in `username`. The
function determines the appropriate method to call (`adminEnableUser` or `adminDisableUser`) based
on the `status` parameter and calls that method with the provided parameters. The function returns
an object with a `success_status` property indicating whether the operation was successful, and a
`message` property containing an error message if the operation was not successful. The function is
marked as `async` to allow for the use of `await` when calling the `adminEnableUser` or
`adminDisableUser` method, which returns a promise. */
module.exports.activateDeactivateUser = async (username, status) => {
    const params = {
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: username,
    }
    try {
        const methodName = status ? 'adminEnableUser' : 'adminDisableUser'
        await cognitoIdentityServiceProvider[methodName](params).promise()
        return { success_status: true }
    } catch (error) {
        return { success_status: false, message: error.message }
    }
}

module.exports.cognitoCreate = async (userData) => {
    try {
        const attributeList = []
        attributeList.push(
            { Name: 'custom:is_first_time_login', Value: 'true' },
            { Name: 'custom:user_type', Value: userData.user_type },
            { Name: 'email', Value: userData.email_address },
        )
        const adminCreateUserParams = {
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: userData.email_address,
            UserAttributes: attributeList,
            MessageAction: 'SUPPRESS',
        }
        const user = await cognitoIdentityServiceProvider.adminCreateUser(adminCreateUserParams).promise()
        console.log('user', user)
        const password_params = {
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: userData.email_address,
            Password: userData.password,
            Permanent: true,
        }
        await cognitoIdentityServiceProvider.adminSetUserPassword(password_params).promise()
        if (user) {
            await cognitoIdentityServiceProvider.adminAddUserToGroup({
                GroupName: userData.user_type,
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: userData.email_address,
            }).promise()
            return {
                success_status: true,
                message: 'User added successfuly',
            }
        }
        return {
            success_status: false,
            message: 'There was an error while creating admin account',
        }
    } catch (error) {
        console.log(error)
        return {
            success_status: false,
            message: error.message,
        }
    }
}

module.exports.cognitoGetUser = async (customer) => {
    try {
        if (customer) {
            const params = {
                UserPoolId: process.env.COGNITO_USER_POOL_ID,
                Username: customer,
            }
            const alreadyExist = await cognitoIdentityServiceProvider.adminGetUser(params).promise()
            console.log('alreadyExist', alreadyExist)
            return {
                success_status: true,
                message: 'User added successfuly',
            }
        }
        return {
            success_status: false,
            message: 'There was an error while creating admin account',
        }
    } catch (error) {
        console.log(error)
        return {
            success_status: false,
            message: error.message,
        }
    }
}

module.exports.cognitoUpdate = async (updateData, emailAddress) => {
    console.log('entering', updateData)
    try {
        console.log('updateddd', updateData)
        const attributeList = []
        attributeList.push({ Name: 'custom:is_first_time_login', Value: updateData.is_first_time_login })
        const cognitoParams = {
            UserAttributes: attributeList,
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: emailAddress,
        }
        const user = await cognitoIdentityServiceProvider.adminUpdateUserAttributes(cognitoParams).promise()
        console.log('user', user)
        return !!user
    } catch (error) {
        console.log('cognito update error', error)
        return {
            success_status: false,
            message: error.message,
        }
    }
}
