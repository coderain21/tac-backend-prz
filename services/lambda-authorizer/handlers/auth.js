/* eslint-disable import/no-unresolved */
/* eslint-disable no-useless-escape */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable func-names */
/* eslint-disable no-console */
/* eslint-disable prefer-regex-literals */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-prototype-builtins */
/* eslint-disable camelcase */
const jwt = require('jsonwebtoken')
const request = require('request')
const jwkToPem = require('jwk-to-pem')

let iss
let pems = false

/**
 * AuthPolicy receives a set of allowed and denied methods and generates a valid
 * AWS policy for the API Gateway authorizer. The constructor receives the calling
 * user principal, the AWS account ID of the API owner, and an apiOptions object.
 * The apiOptions can contain an API Gateway RestApi Id, a region for the RestApi, and a
 * stage that calls should be allowed/denied for. For example
 * {
 *   restApiId: "xxxxxxxxxx",
 *   region: "us-east-1",
 *   stage: "dev"
 * }
 *
 * var testPolicy = new AuthPolicy("[principal user identifier]", "[AWS account id]", apiOptions);
 * testPolicy.allowMethod(AuthPolicy.HttpVerb.GET, "/users/username");
 * testPolicy.denyMethod(AuthPolicy.HttpVerb.POST, "/pets");
 * context.succeed(testPolicy.build());
 *
 * @class AuthPolicy
 * @constructor
 */
function AuthPolicy(principal, awsAccountId, apiOptions) {
    /**
     * The AWS account id the policy will be generated for. This is used to create
     * the method ARNs.
     *
     * @property awsAccountId
     * @type {String}
     */
    this.awsAccountId = awsAccountId

    /**
     * The principal used for the policy, this should be a unique identifier for
     * the end user.
     *
     * @property principalId
     * @type {String}
     */
    this.principalId = principal

    /**
     * The policy version used for the evaluation. This should always be "2012-10-17"
     *
     * @property version
     * @type {String}
     * @default "2012-10-17"
     */
    this.version = '2012-10-17'

    /**
     * The regular expression used to validate resource paths for the policy
     *
     * @property pathRegex
     * @type {RegExp}
     * @default '^\/[/.a-zA-Z0-9-\*]+$'
     */
    this.pathRegex = new RegExp('^[/.a-zA-Z0-9-\\*]+$')

    // these are the internal lists of allowed and denied methods. These are lists
    // of objects and each object has 2 properties: A resource ARN and a nullable
    // conditions statement.
    // the build method processes these lists and generates the approriate
    // statements for the final policy
    this.allowMethods = []
    this.denyMethods = []

    if (!apiOptions || !apiOptions.restApiId) {
        this.restApiId = '*'
    } else {
        this.restApiId = apiOptions.restApiId
    }
    if (!apiOptions || !apiOptions.region) {
        this.region = '*'
    } else {
        this.region = apiOptions.region
    }
    if (!apiOptions || !apiOptions.stage) {
        this.stage = '*'
    } else {
        this.stage = apiOptions.stage
    }
}

function validateToken(pems_data, event, context) {
    // const token = event.authorizationToken
    // Fail if the token is not jwt
    const auth_token = (event.authorizationToken).split(' ')
    const decodedJwt = jwt.decode(auth_token[1], { complete: true })
    if (!decodedJwt) {
        console.log('Not a valid JWT token')
        context.fail('Unauthorized')
        return
    }

    // Reject the jwt if it's not an 'Access Token'
    if (decodedJwt.payload.token_use !== 'access') {
        console.log('Not an access token')
        context.fail('Unauthorized')
        return
    }

    // Get the kid from the token and retrieve corresponding PEM
    const { kid } = decodedJwt.header
    const pem = pems_data[kid]
    if (!pem) {
        console.log('Invalid access token')
        context.fail('Unauthorized')
        return
    }

    // Verify the signature of the JWT token to ensure it's really coming from your User Pool
    const policy_data = {
        principalId: decodedJwt.principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: 'Allow',
                    Resource: [
                        `arn:aws:execute-api:eu-west-2:929441721738:*/${process.env.STAGE}/*/*`,
                    ],
                },
            ],
        },
    } // policy.build()
    policy_data.context = { data: JSON.stringify(decodedJwt.payload) }
    console.log('policy_data', policy_data)
    context.succeed(policy_data)
    // jwt.verify(auth_token[1], pem, { issuer: iss }, (err, payload) => {
    //     if (err) {
    //         context.fail('Unauthorized4')
    //         return
    //     } else {
    //     // Valid token. Generate the API Gateway policy for the user
    //     // Always generate the policy on value of 'sub' claim and not for 'username' because username is reassignable
    //     // sub is UUID for a user which is never reassigned to another user.
    //         const principalId = payload.sub

    //         // Get AWS AccountId and API Options
    //         const apiOptions = {}
    //         const tmp = event.methodArn.split(':')
    //         const apiGatewayArnTmp = tmp[5].split('/')
    //         const awsAccountId = tmp[4]
    //         apiOptions.region = tmp[3]
    //         apiOptions.restApiId = apiGatewayArnTmp[0]
    //         apiOptions.stage = apiGatewayArnTmp[1]
    //         const method = apiGatewayArnTmp[2]
    //         let resource = '/' // root resource
    //         if (apiGatewayArnTmp[3]) {
    //             resource += apiGatewayArnTmp[3]
    //         }
    //         // For more information on specifics of generating policy, refer to blueprint for API Gateway's Custom authorizer in Lambda console
    //         const policy = new AuthPolicy(principalId, awsAccountId, apiOptions)
    //         policy.allowAllMethods()
    //         console.log('policy.build()', JSON.stringify(policy.build()))
    //         const policy_data = policy.build()
    //         // policy_data.context = decodedJwt.payload
    //         context.succeed(policy.build())
    //         return
    //     }
    // })
}

/**
 * A set of existing HTTP verbs supported by API Gateway. This property is here
 * only to avoid spelling mistakes in the policy.
 *
 * @property HttpVerb
 * @type {Object}
 */
AuthPolicy.HttpVerb = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    PATCH: 'PATCH',
    HEAD: 'HEAD',
    DELETE: 'DELETE',
    OPTIONS: 'OPTIONS',
    ALL: '*',
}

AuthPolicy.prototype = (function () {
    /**
     * Adds a method to the internal lists of allowed or denied methods. Each object in
     * the internal list contains a resource ARN and a condition statement. The condition
     * statement can be null.
     *
     * @method addMethod
     * @param {String} The effect for the policy. This can only be "Allow" or "Deny".
     * @param {String} he HTTP verb for the method, this should ideally come from the
     *                 AuthPolicy.HttpVerb object to avoid spelling mistakes
     * @param {String} The resource path. For example "/pets"
     * @param {Object} The conditions object in the format specified by the AWS docs.
     * @return {void}
     */
    const addMethod = function (effect, verb, resource, conditions) {
        if (verb !== '*' && !AuthPolicy.HttpVerb.hasOwnProperty(verb)) {
            throw new Error(`Invalid HTTP verb ${verb}. Allowed verbs in AuthPolicy.HttpVerb`)
        }

        this.pathRegex = new RegExp('^[/.a-zA-Z0-9-\*]+$')

        if (!this.pathRegex.test(resource)) {
            throw new Error(`Invalid resource path: ${resource}. Path should match ${this.pathRegex}`)
        }

        let cleanedResource = resource
        if (resource.substring(0, 1) === '/') {
            cleanedResource = resource.substring(1, resource.length)
        }
        const resourceArn = `arn:aws:execute-api:${
            this.region}:${
            this.awsAccountId}:${
            this.restApiId}/${
            this.stage}/${
            verb}/${
            cleanedResource}`

        if (effect.toLowerCase() === 'allow') {
            this.allowMethods.push({
                resourceArn,
                conditions,
            })
        } else if (effect.toLowerCase() === 'deny') {
            this.denyMethods.push({
                resourceArn,
                conditions,
            })
        }
    }

    /**
     * Returns an empty statement object prepopulated with the correct action and the
     * desired effect.
     *
     * @method getEmptyStatement
     * @param {String} The effect of the statement, this can be "Allow" or "Deny"
     * @return {Object} An empty statement object with the Action, Effect, and Resource
     *                  properties prepopulated.
     */
    const getEmptyStatement = (effect_data) => {
        let effect = effect_data
        effect = effect.substring(0, 1).toUpperCase() + effect.substring(1, effect.length).toLowerCase()
        const statement = {}
        statement.Action = 'execute-api:Invoke'
        statement.Effect = effect
        statement.Resource = []

        return statement
    }

    /**
     * This function loops over an array of objects containing a resourceArn and
     * conditions statement and generates the array of statements for the policy.
     *
     * @method getStatementsForEffect
     * @param {String} The desired effect. This can be "Allow" or "Deny"
     * @param {Array} An array of method objects containing the ARN of the resource
     *                and the conditions for the policy
     * @return {Array} an array of formatted statements for the policy.
     */
    const getStatementsForEffect = (effect, methods) => {
        const statements = []

        if (methods.length > 0) {
            const statement = getEmptyStatement(effect)

            for (let i = 0; i < methods.length; i += 1) {
                const curMethod = methods[i]
                if (curMethod.conditions === null || curMethod.conditions.length === 0) {
                    statement.Resource.push(curMethod.resourceArn)
                } else {
                    const conditionalStatement = getEmptyStatement(effect)
                    conditionalStatement.Resource.push(curMethod.resourceArn)
                    conditionalStatement.Condition = curMethod.conditions
                    statements.push(conditionalStatement)
                }
            }

            if (statement.Resource !== null && statement.Resource.length > 0) {
                statements.push(statement)
            }
        }

        return statements
    }

    return {
        constructor: AuthPolicy,

        /**
         * Adds an allow "*" statement to the policy.
         *
         * @method allowAllMethods
         */
        allowAllMethods() {
            addMethod.call(this, 'allow', '*', '*', null)
        },

        /**
         * Adds a deny "*" statement to the policy.
         *
         * @method denyAllMethods
         */
        denyAllMethods() {
            addMethod.call(this, 'deny', '*', '*', null)
        },

        /**
         * Adds an API Gateway method (Http verb + Resource path) to the list of allowed
         * methods for the policy
         *
         * @method allowMethod
         * @param {String} The HTTP verb for the method, this should ideally come from the
         *                 AuthPolicy.HttpVerb object to avoid spelling mistakes
         * @param {string} The resource path. For example "/pets"
         * @return {void}
         */
        allowMethod(verb, resource) {
            addMethod.call(this, 'allow', verb, resource, null)
        },

        /**
         * Adds an API Gateway method (Http verb + Resource path) to the list of denied
         * methods for the policy
         *
         * @method denyMethod
         * @param {String} The HTTP verb for the method, this should ideally come from the
         *                 AuthPolicy.HttpVerb object to avoid spelling mistakes
         * @param {string} The resource path. For example "/pets"
         * @return {void}
         */
        denyMethod(verb, resource) {
            addMethod.call(this, 'deny', verb, resource, null)
        },

        /**
         * Adds an API Gateway method (Http verb + Resource path) to the list of allowed
         * methods and includes a condition for the policy statement. More on AWS policy
         * conditions here: http://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html#Condition
         *
         * @method allowMethodWithConditions
         * @param {String} The HTTP verb for the method, this should ideally come from the
         *                 AuthPolicy.HttpVerb object to avoid spelling mistakes
         * @param {string} The resource path. For example "/pets"
         * @param {Object} The conditions object in the format specified by the AWS docs
         * @return {void}
         */
        allowMethodWithConditions(verb, resource, conditions) {
            addMethod.call(this, 'allow', verb, resource, conditions)
        },

        /**
         * Adds an API Gateway method (Http verb + Resource path) to the list of denied
         * methods and includes a condition for the policy statement. More on AWS policy
         * conditions here: http://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html#Condition
         *
         * @method denyMethodWithConditions
         * @param {String} The HTTP verb for the method, this should ideally come from the
         *                 AuthPolicy.HttpVerb object to avoid spelling mistakes
         * @param {string} The resource path. For example "/pets"
         * @param {Object} The conditions object in the format specified by the AWS docs
         * @return {void}
         */
        denyMethodWithConditions(verb, resource, conditions) {
            addMethod.call(this, 'deny', verb, resource, conditions)
        },

        /**
         * Generates the policy document based on the internal lists of allowed and denied
         * conditions. This will generate a policy with two main statements for the effect:
         * one statement for Allow and one statement for Deny.
         * Methods that includes conditions will have their own statement in the policy.
         *
         * @method build
         * @return {Object} The policy object that can be serialized to JSON.
         */
        build() {
            if ((!this.allowMethods || this.allowMethods.length === 0)
                    && (!this.denyMethods || this.denyMethods.length === 0)) {
                throw new Error('No statements defined for the policy')
            }

            const policy = {}
            policy.principalId = this.principalId
            const doc = {}
            doc.Version = this.version
            doc.Statement = []

            doc.Statement = doc.Statement.concat(getStatementsForEffect.call(this, 'Allow', this.allowMethods))
            doc.Statement = doc.Statement.concat(getStatementsForEffect.call(this, 'Deny', this.denyMethods))

            policy.policyDocument = doc

            return policy
        },
    }
}())

module.exports.handler = (event, context) => {
    try {
        // Download PEM for your UserPool if not already downloaded
        // console.log('event', JSON.stringify(event))
        if (!pems) {
            console.log('no pems')
            const auth_token = (event.authorizationToken).split(' ')
            // Download the JWKs and save it as PEM
            const decodedJwt = jwt.decode(auth_token[1], { complete: true })
            console.log('decodedJwt', decodedJwt)
            iss = decodedJwt.payload.iss
            request({
                url: `${iss}/.well-known/jwks.json`,
                json: true,
            }, (error, response, body) => {
                if (!error && response.statusCode === 200) {
                    pems = {}
                    const { keys } = body
                    for (let i = 0; i < keys.length; i += 1) {
                        // Convert each key to PEM
                        const key_id = keys[i].kid
                        const modulus = keys[i].n
                        const exponent = keys[i].e
                        const key_type = keys[i].kty
                        const jwk = { kty: key_type, n: modulus, e: exponent }
                        const pem = jwkToPem(jwk)
                        pems[key_id] = pem
                    }
                    // Now continue with validating the token
                    validateToken(pems, event, context)
                } else {
                    // Unable to download JWKs, fail the call
                    context.fail('error')
                    return true
                }
                return false
            })
        } else {
            console.log(' with pem')

            // PEMs are already downloaded, continue with validating the token
            validateToken(pems, event, context)
        }
    } catch (e) {
        context.fail('Unauthorized')
    }
}
