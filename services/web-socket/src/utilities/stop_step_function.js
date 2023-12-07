const { StepFunctions } = require('aws-sdk')

module.exports.getExecutionArn = async (currentLotDetails) => {
    try {
        console.log('currentLotDetails', currentLotDetails)
        const connectionData = await this.connect()
        const database = connectionData.connection.db// Access the database
        const collection = database.collection('dev-buyers') // Replace with your collection name
        const query = {
            lot_id: currentLotDetails.lot_id, // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
            seller_email: currentLotDetails.seller_email,
        } // Corrected 'document.buyer_id'
        console.log('seller', query)
        const documents = await collection.find(query).toArray() // Await the query result
        connectionData.disconnect()
        return documents
    } catch (err) {
        console.log(err)
        return false
    }
}

module.exports.stopExecution = async (currentLotDetails) => {
    try {
        const stepFunctions = new StepFunctions()
        const getArn = await this.getExecutionArn(currentLotDetails)
        console.log('getarn', getArn)
        const executionArn = getArn[0].arn
        const response = await stepFunctions.stopExecution({
            executionArn,
            cause: 'User initiated stop', // Optional: Specify a cause for stopping the execution
        }).promise()
        console.log('response', response)
        return { status: true, message: 'Execution stopped successfully' }
    } catch (error) {
        console.log('err', error)
        return {
            status: false,
            message: 'Authentication Failed',
        }
    }
}
