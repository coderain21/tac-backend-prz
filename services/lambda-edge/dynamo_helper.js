/* eslint-disable no-undef */
/* eslint-disable no-console */
const { DynamoDB } = require('aws-sdk')

const dynamoDb = new DynamoDB.DocumentClient({ region: 'us-east-1' })

module.exports.view = async (params) => {
    try {
        const {
            query,
            tableName,
            indexName,
            // eslint-disable-next-line camelcase
            projection_expression,
        } = params
        const keys = Object.keys(query)
        const keyName = keys[0]

        let keyConditionExpression = `#${keyName} = :${keyName}`
        const expressionAttributeNames = { [`#${keyName}`]: keyName }
        const expressionAttributeValues = { [`:${keyName}`]: query[keyName] }

        if (keys.length > 1) {
            const sortKeyName = keys[1]
            keyConditionExpression += ` AND #${sortKeyName} = :${sortKeyName}`
            expressionAttributeNames[`#${sortKeyName}`] = sortKeyName
            expressionAttributeValues[`:${sortKeyName}`] = query[sortKeyName]
        }
        const queryParams = {
            TableName: tableName,
            KeyConditionExpression: keyConditionExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        }
        // eslint-disable-next-line camelcase
        if (projection_expression) {
            queryParams.ProjectionExpression = params.projection_expression
        }
        if (indexName) {
            queryParams.IndexName = indexName
        }
        const queryResult = await dynamoDb.query(queryParams).promise()
        console.log(queryResult)
        return queryResult
    } catch (error) {
        console.log(error)
        throw new Error(error)
    }
}
