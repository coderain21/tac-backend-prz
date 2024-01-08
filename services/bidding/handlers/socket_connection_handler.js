/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */

let connection

module.exports.handler = async (event) => {
    try {
        const { routeKey, connectionId } = event.requestContext
        console.log('routekey', routeKey, connectionId)
        if (routeKey === '$connect') {
            console.log('Connecting to')
        }
        if (routeKey === '$disconnect') {
            console.log('disconnecting from')
        }

        return {
            statusCode: 500,
            body: JSON.stringify('There was an error while establishing the connection'),
        }
    } catch (error) {
        console.error(error)
        return {
            statusCode: 500,
            body: JSON.stringify('There was an error while establishing the connection'),
        }
    } finally {
    // Disconnect from the MongoDB database
        if (connection) {
            await connection.disconnect()
        }
    }
}
