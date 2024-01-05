/* eslint-disable no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/no-useless-path-segments */
const jwt = require('jsonwebtoken')
const jwksClient = require('jwks-rsa')

// Cognito pool information
const cognitoPoolId = 'eu-west-2_72rz6biiL'
const cognitoRegion = 'eu-west-2'

// Initialize the JWKS (JSON Web Key Set) client
const client = jwksClient({
    jwksUri: `https://cognito-idp.${cognitoRegion}.amazonaws.com/${cognitoPoolId}/.well-known/jwks.json`,
})

const mongodbHelper = require('../utilities/mongodb_helper')

module.exports.checkBuyerAuthentication = async (authParams) => {
    try {
        const connection = await mongodbHelper.connect()
        const database = connection.connection.db // Access the database
        const collection = database.collection('dev-register-auction') // Replace with your collection name
        // Query documents based on the email address
        const query = { email_address: authParams.buyer_id }
        const documents = await collection.find(query).toArray() // Await the query result
        if (String(authParams.auction_id) === String(documents[0].auction_id)) {
            return true
        }

        return false
    } catch (error) {
        return {
            status: false,
            message: 'Authentication Failed',
        }
    }
}

// Get the public key for the given key ID
async function getKey(kid) {
    return new Promise((resolve, reject) => {
        client.getSigningKey(kid, (err, key) => {
            if (err) {
                reject(err)
            } else {
                const signingKey = {
                    kid: key.kid,
                    publicKey: key.publicKey || key.rsaPublicKey,
                }
                resolve(signingKey)
            }
        })
    })
}

module.exports.authenticationCheck = async (token) => {
    try {
        // Decode the token (no verification at this stage)
        const decodedToken = jwt.decode(token, { complete: true })

        // Get the key ID from the decoded token header
        const { kid } = decodedToken.header

        // Get the signing key based on the key ID
        const key = await getKey(kid)

        // Verify the token using the key
        const verifiedToken = jwt.verify(token, key.publicKey, { algorithms: ['RS256'] })

        // Token is valid
        return {
            statusCode: 200,
        }
    } catch (error) {
        console.log('errr', error)
        // Token is invalid
        return {
            statusCode: 401,
        }
    }
}
