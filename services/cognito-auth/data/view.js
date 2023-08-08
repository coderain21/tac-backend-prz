/* eslint-disable no-console */
const { DynamoDB, config } = require('aws-sdk')

config.update({ region: process.env.REGION })
const dynamoDb = new DynamoDB.DocumentClient()

/**
 * Function to fetch user data.
 * @param {Object} tableName
 * @param {Object} partionKey
 * @param {String} email
 * @returns returns user data.
 */
module.exports.view = async (tableName, partionKey, email, isAdmin) => {
    try {
        const listParams = {
            TableName: tableName,
            KeyConditionExpression: `#${partionKey.key} = :${partionKey.key}`,
            ExpressionAttributeNames: {},
            ExpressionAttributeValues: {},
        }
        if (isAdmin) {
            listParams.ExpressionAttributeNames[`#${partionKey.key}`] = `${partionKey.key}`
            listParams.ExpressionAttributeValues[`:${partionKey.key}`] = `${partionKey.value}`

            listParams.FilterExpression = '#email_key = :email_key'
            listParams.ExpressionAttributeNames['#email_key'] = 'email_key'
            listParams.ExpressionAttributeValues[':email_key'] = email
        } else {
            listParams.ExpressionAttributeNames[`#${partionKey.key}`] = `${partionKey.key}`
            listParams.ExpressionAttributeValues[`:${partionKey.key}`] = `${partionKey.value}`
            listParams.IndexName = 'fetch_email'
        }
        const data = await dynamoDb.query(listParams).promise()
        return {
            success_status: true,
            data: data.Items,
        }
    } catch (error) {
        throw new Error(error)
    }
}
