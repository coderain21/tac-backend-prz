/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const AWS = require('aws-sdk')
const helpers = require('../../lib/helper')

/**
 * Delete Image from S3 API
 * @description - API to delete an image from S3 bucket using S3 key
 * @route - DELETE /s3/delete
 * @access - (Private)
 * @user - IndyAuction Admin/Seller
 * @returns {Object} (200) - Success message
 * @returns {Error} (400) - Bad request or validation error
 * @returns {Error} (403) - Unauthorized access
 * @returns {Error} (404) - Image not found
 * @returns {Error} (500) - Internal server error
 */
module.exports.delete_image = async (event) => {
    try {
        // --- Authorization Check ---
        const { claims } = event.requestContext?.authorizer || {}
        if (!claims || !claims['cognito:username']) {
            return {
                statusCode: 403,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({ message: 'You do not have access to perform this API action' }),
            }
        }

        // --- Parse and validate request body ---
        const requestBody = JSON.parse(event.body) || {}
        const { key } = requestBody

        // --- Validate key is provided ---
        if (!key) {
            return {
                statusCode: 400,
                headers: await helpers.getHeaders(),
                body: JSON.stringify({
                    message: 'S3 key is required',
                }),
            }
        }

        const bucketName = process.env.S3_BUCKET

        // --- Initialize S3 client ---
        const s3Client = new AWS.S3({
            region: process.env.AWS_REGION || 'eu-west-2',
        })

        // --- Check if object exists before deletion ---
        try {
            await s3Client.headObject({
                Bucket: bucketName,
                Key: key,
            }).promise()
        } catch (headError) {
            if (headError.statusCode === 404) {
                return {
                    statusCode: 404,
                    headers: await helpers.getHeaders(),
                    body: JSON.stringify({
                        message: 'Image not found in S3',
                    }),
                }
            }
            // Re-throw other errors
            throw headError
        }

        // --- Delete the object from S3 ---
        const deleteResult = await s3Client.deleteObject({
            Bucket: bucketName,
            Key: key,
        }).promise()

        console.log('S3 delete result:', deleteResult)

        // --- Return successful response ---
        return {
            statusCode: 200,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({
                message: 'Image deleted successfully from S3',
                bucket: bucketName,
                key,
            }),
        }
    } catch (error) {
        console.log('Internal Server Error', error)
        return {
            headers: await helpers.getHeaders(),
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
                error: error.message,
            }),
        }
    }
}
