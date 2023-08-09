/* eslint-disable camelcase */
/* eslint-disable no-console */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
const AWS = require('aws-sdk')
const Users = require('../entities/Users')
const mongoConnection = require('../lib/mongodb_helper')

AWS.config.update({ region: process.env.REGION })

/**
 * Function to handle  cognito post challenge event
 * @param {Object} event
 * @param {Object} _context
 * @param {Object} callback
 * @returns returns event object
 */
exports.handler = async (event, _context, callback) => {
    try {
        console.log('event', event, event.identities[0].email)
        // callback(null, event)
    } catch (error) {
        console.log(error)
        callback(error, event)
    }
}
