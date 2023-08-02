/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */
/* eslint-disable import/no-unresolved */
const mongoose = require('mongoose')
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
        const connection = await mongoose.connect(process.env.MONGODB_CONNECTION_STRING, { useNewUrlParser: true })
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

module.exports.view = async (table_name, collection_name, id) => {
    try {
        const connection = await mongoConnection.connect()
        const database = connection.db(table_name) // Replace with your database name
        const collection = database.collection(collection_name) // Replace with your collection name
        const query = id
        const get_user = await collection.find(query).toArray()
        console.log(get_user, 'get')
        return get_user
    } catch (error) {
        console.log(error)
        return false
    }
}

module.exports.update = async (table_name, collection_name, query, updateOperation) => {
    try {
        console.log('coll', collection_name)
        const connection = await mongoConnection.connect()
        const database = await connection.db(table_name)
        const collection = database.collection(collection_name)
        const updatedInformation = collection.updateOne(
            query,
            updateOperation, // Add the update operation as the second argument
        )
        return updatedInformation
    } catch (error) {
        console.log(error)
        return false
    }
}
