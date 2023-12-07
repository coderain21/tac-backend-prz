const { StepFunctions } = require('aws-sdk')
const mongodbHelper = require('./mongodb_helper')


module.exports.stopExecution = async (currentLotDetails) => {
    try {
        const stepFunctions = new StepFunctions()
        const getArn = await mongodbHelper.getExecutionArn(currentLotDetails)
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
