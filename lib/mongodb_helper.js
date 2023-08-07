/* eslint-disable no-console */
const mongoose = require('mongoose')
// eslint-disable-next-line import/no-extraneous-dependencies
require('dotenv').config()

/* This code exports a function named `connect` as a property of the `module.exports` object. The
`connect` function uses the `mongoose` library to connect to a MongoDB database using the connection
string specified in the `process.env.MONGODB_CONNECTION_STRING` environment variable. If the
connection is successful, the function logs a success message to the console and returns the
connection object. If the connection fails, the function logs an error message to the console and
returns `false`. The function is marked as `async` because it uses `await` to wait for the
connection to be established before returning the connection object or error. */

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
