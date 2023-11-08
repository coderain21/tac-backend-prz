/* eslint-disable import/no-useless-path-segments */
const mongodbHelper = require('../utilities/mongodb_helper')

module.exports.checkBuyerAuthentication = async (authParams) => {
    try {
        const connection = await mongodbHelper.connect()
        const database = connection.connection.db // Access the database
        const collection = database.collection('dev-register-auction') // Replace with your collection name
        // Query documents based on the email address
        const query = { email_address: authParams.buyer_id }
        const documents = await collection.find(query).toArray() // Await the query result
        console.log(documents, 'DDD')
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
