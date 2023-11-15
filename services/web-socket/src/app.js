/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-tabs */
const { checkAuthentication } = require('./routes/check-authentication')
const { placeBid } = require('./routes/place_bid')
// const { listMessages } = require('./routes/list_messages')
// const config = require('./config/beta')

module.exports.initiateEvents = async (socket, io, userData, users) => {
    console.log('hello initiate')
    /**
	 * @channel - CREATE_CHAT
	 * @channelDescription -
	 * 	- Creates new chat when clients emits to "createMessage" channel .
	 * @channelType - Private
	 * Channel Payload Info -
	 *  - @param {Object} message - Payload from the when client emits "listMessages" event.
	 * 	  - @param {string} chatId To fetch chatlist based on chatId.
	 *    - @param {string} chatSenderId Sender of the chat list.
	 *    - @param {string} chatReceiverId Receiver of the chat list.
	 *    - @param {string} chatReceiverId Receiver of the chat list.
	 *    - @param {string} chatReceiverId Receiver of the chat list.
	 *    - @param {string} chatReceiverId Receiver of the chat list.
	 *    - @param {string} chatReceiverId Receiver of the chat list.
	 * @return {array} [] Channel emits "getMyChatList" event containing list of chats
	 */
    socket.on('checkAuthentication', (message, callback) => checkAuthentication(socket, message, callback, userData, users, io))
    /**
	 * @channel - LIST_CHAT
	 * @channelDescription -
	 * 	- Lists all client and partner messages based on the current date.
	 * @channelType - Private
	 * Channel Payload Info -
	 *  - @param {Object} message - Payload from the when client emits "listMessages" event.
	 * 	  - @param {string} chatId To fetch chatlist based on chatId.
	 *    - @param {string} chatSenderId Sender of the chat list.
	 *    - @param {string} chatReceiverId Receiver of the chat list.
	 * @return {array} [] Channel emits "getMyChatList" event containing list of chats
	 */
    socket.on('placeBid', (message, callback) => placeBid(socket, message, io, userData))
}
