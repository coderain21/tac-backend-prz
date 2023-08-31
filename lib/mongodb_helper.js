/* eslint-disable import/no-self-import */
/* eslint-disable camelcase */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
const mongoose = require('mongoose')
// eslint-disable-next-line import/no-extraneous-dependencies
require('dotenv').config()
const { MongoClient } = require('mongodb')

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

/* `module.exports.save` is a function that takes in two parameters: `document` and `Schema`. It
creates a new instance of the `Schema` model using the `document` parameter, and then saves it to
the MongoDB database using the `save()` method. If the save operation is successful, the function
returns `true`. If there is an error during the save operation, the function logs the error to the
console and returns `false`. This function can be used to save documents to the database using the
specified schema. */
module.exports.save = async (document, Schema) => {
    try {
        const schema = new Schema(document)
        await schema.save()
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

/* The `module.exports.view` function is used to retrieve data from the MongoDB database. It takes in
two parameters: `Users` and `query`. */
module.exports.view = async (Users, query) => {
    try {
        const userData = await Users.find(query)
        return userData
    } catch (error) {
        console.log(error)
        return false
    }
}

/* The `module.exports.update` function is used to update a document in the MongoDB database. It takes
in three parameters: `Users`, `user_id`, and `update_information`. */
module.exports.update = async (Users, user_id, update_information) => {
    try {
        console.log('update', update_information)
        // const connection = await mongoConnection.connect()
        const updatedInformation = await Users.updateOne({ _id: user_id }, { $set: update_information })
        console.log(update_information, 'updateddd')
        // await connection.disconnect()
        return updatedInformation
    } catch (error) {
        console.log(error)
        return false
    }
}

/* The `module.exports.updateUsingMongoDB` function is used to update a document in a MongoDB database
using the MongoDB Node.js driver. It takes in five parameters: `dbUrl`, `dbName`, `collectionName`,
`user_id`, and `updateInformation`. */
module.exports.updateUsingMongoDB = async (dbUrl, dbName, collectionName, user_id, updateInformation) => {
    const client = new MongoClient(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true })
    try {
        await client.connect()
        const db = client.db(dbName)
        const collection = db.collection(collectionName)
        const updateResult = await collection.updateOne(
            { _id: user_id },
            { $set: updateInformation },
        )
        client.close()
        return updateResult
    } catch (error) {
        console.log(error)
        return false
    }
}
