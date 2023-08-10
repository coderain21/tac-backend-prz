/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const helpers = require('../lib/helper')

const planPriority = {
    Free: 1,
    Starter: 2,
    Pro: 3,
    Enterprise: 4,
}

function canUpgrade(currentPlan, newPlan) {
    return planPriority[newPlan] > planPriority[currentPlan]
}

function canDowngrade(currentPlan, newPlan) {
    return planPriority[newPlan] < planPriority[currentPlan]
}

module.exports.validationCheck = async (requestBody) => {
    try {
        // Example usage
        const currentPlan = requestBody.current_plan
        const newPlan = requestBody.new_plan
        const planStatus = requestBody.plan_status
        if (planStatus === 'Upgrade') {
            if (canUpgrade(currentPlan, newPlan)) {
                return {
                    success_status: true,
                }
            }
            return {
                success_status: false,
            }
        } if (planStatus === 'Downgrade') {
            if (canDowngrade(currentPlan, newPlan)) {
                return {
                    success_status: true,
                }
            }
            return {
                success_status: false,
            }
        }
        return {
            success_status: false,
        }
    } catch (err) {
        return {
            statusCode: 400,
            headers: await helpers.getHeaders(),
            body: JSON.stringify({ message: 'Something went wrong.Please try again.' }),
        }
    }
}
