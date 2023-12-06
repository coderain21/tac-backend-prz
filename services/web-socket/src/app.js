/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-tabs */
const { checkAuthentication } = require('./routes/check-authentication')
const { placeBid, joinBidRoom } = require('./routes/place_bid')
const { listBidHistory } = require('./routes/bid_history')
const {extensionAlert} = require('./routes/update_extension')

/* The code is exporting a function called `initiateEvents` as a property of the `module.exports`
object. This function takes four parameters: `socket`, `io`, `userData`, and `users`. */
module.exports.initiateEvents = async (socket, io, userData, users) => {
    console.log('hello initiate')
    socket.on('checkAuthentication', (message, callback) => checkAuthentication(socket, message, callback, userData, users, io))
    socket.on('placeBid', (message, callback) => placeBid(socket, message, io, userData))
    socket.on('listBidHistory', (message, callback) => listBidHistory(socket, message, io, userData))
    socket.on('joinBidRoom', (lotID, buyer_id, callback) => joinBidRoom(socket, lotID, io))
    socket.on('extensionAlert', (lotID) => extensionAlert(socket, lotID, io))
}
