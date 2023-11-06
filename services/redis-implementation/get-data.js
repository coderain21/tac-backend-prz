/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable import/no-extraneous-dependencies */

const { createClient } = require('redis')

async function get() {
    try {
        const client = createClient()
        const connection = await client.connect()
        // await connection.set('user:Murali', JSON.stringify(data))
        const userData = await connection.get('user:Shrinith')
        console.log('user data', userData)
        // Check if the data exists
        if (userData) {
            const parsedData = JSON.parse(userData)
            console.log('Retrieved data:', parsedData)
        } else {
            console.log('Data not found in Redis')
        }
        client.quit()
    } catch (error) {
        console.error('Error:', error)
    }
}

// Call the insertData function to insert data into Redis
get()

// Close the Redis client when done
// redisClient.quit()
