/* eslint-disable import/no-self-import */
/* eslint-disable camelcase */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
const mongoose = require('mongoose')

module.exports.connect = async () => {
    try {
        const connection = await mongoose.connect(process.env.MONGO_CLIENT, { useNewUrlParser: true })
        // eslint-disable-next-line no-console
        console.log('MongoDB connected successfully')
        return connection
    } catch (err) {
        console.log('MongoDB connection error:', err)
        return false
    }
}
/* This code exports a function named `connect` as a property of the `module.exports` object. The
`connect` function uses the `mongoose` library to connect to a MongoDB database using the connection
string specified in the `process.env.MONGODB_CONNECTION_STRING` environment variable. If the
connection is successful, the function logs a success message to the console and returns the
connection object. If the connection fails, the function logs an error message to the console and
returns `false`. The function is marked as `async` because it uses `await` to wait for the
connection to be established before returning the connection object or error. */

module.exports.subdomain = async (table_name, collection_name, query) => {
    try {
        const connection = await this.connect()
        const database = connection.db(table_name) // Replace with your database name
        const collection = database.collection(collection_name) // Replace with your collection name
        const get_user = await collection.find(query).toArray()
        console.log(get_user, 'get')
        const [domain_data] = get_user
        return domain_data
    } catch (error) {
        console.log(error)
        return false
    }
}
