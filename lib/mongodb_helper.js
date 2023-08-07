/* eslint-disable import/no-self-import */
/* eslint-disable camelcase */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
const mongoose = require('mongoose')
require('dotenv').config()
const mongoConnection = require('./mongodb_helper')

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
        console.log('MongoDB connected successfully')
        return connection
    } catch (err) {
        console.log('MongoDB connection error:', err)
        return false
    }
}

/* `module.exports.save` is a function that takes in two parameters: `document` and `Schema`. It
creates a new instance of the `Schema` model using the `document` parameter, and then saves it to
the MongoDB database using the `save()` method. If the save operation is successful, the function
returns `true`. If there is an error during the save operation, the function logs the error to the
console and returns `false`. This function can be used to save documents to the database using the
specified schema. */
module.exports.save = async (document, Schema) => {
    try {
        const schema = new Schema(document)
        console.log('schd', schema)
        const s = await schema.save()
        console.log('s', s)
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.view = async (Users, query) => {
    try {
        const connection = await mongoConnection.connect()
        const userData = await Users.find(query)
        await connection.disconnect()
        return userData
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.update = async (Users, user_id, update_information) => {
    try {
        const updatedInformation = Users.updateOne({ _id: user_id }, { $set: update_information })
        // await connection.disconnect()
        return updatedInformation
    } catch (error) {
        console.log(error)
        return false
    }
}
