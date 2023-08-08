/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/**
 * Function to handle  cognito post challenge event
 * @param {Object} event
 * @param {Object} _context
 * @param {Object} callback
 * @returns returns event object
 */
exports.handler = async (event, _context, callback) => {
    try {
        console.log('event', event)
        // const eventData = event
        // console.log(eventData)
        // const connection = await mongoConnection.connect()
        // const user = {
        //     child_first_name: eventData.child_first_name,
        //     child_last_name: eventData.child_last_name,
        //     child_age: eventData.child_age,
        //     parent_first_name: eventData.parent_first_name,
        //     parent_last_name: eventData.parent_last_name,
        //     email: eventData.email,
        //     country: eventData.country,
        //     password: eventData.password,

        // }
        // const get_user = await connection.db(process.env.MONGODB_NAME).collection(process.env.MONGODB_COLLECTION_NAME).insertOne(user)
        // console.log('USER', get_user)
        // const create_users = await cognitoHelper.cognitoCreate(user)
        // console.log('users', create_users)
        // await connection.disconnect()
        // if (!user) {
        //     return { success_status: false, message: 'There was an error while creating the usser' }
        // }
        // await connection.disconnect()
        callback(null, event)
    } catch (error) {
        console.log(error)
        callback(error, event)
    }
}
