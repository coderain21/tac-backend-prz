/**
 * @class - AppUsers
 * @constructor - Initializes user array
 * @addUser - To add the user into users 
 * 		- @param {string} socketId - socket id of the connected device
 * 		- @param {string} userId - userId of connected device
 * 		- @returns {Object} user - returns user objects
 * @removeUser - To remove user when he gets disconnected from the server 
 * 		- @param {string} userId - userId of connected device
 * 		- @returns {Object} user - returns user objects
 * @getUser - To fetch user 
 * 		- @param {string} userId - userId of connected device
 * 		- @returns {Object} user - returns user objects
 */
class AppUsers {

	constructor () {
		this.users = []
	}

	addUser (socketId, userId) {
		const user = { socketId, userId }
		this.users.push(user)
		return user
	}

	removeUser (socketId) {
		this.users.forEach((userData, index) => {
			if(typeof(this.users[index]) !== 'undefined') {
				if(this.users[index].socketId === socketId) {
					const currentUser = this.users[index]
					this.users.splice(index, 1)
					return currentUser
				}
			}
		})
	}

	getUser (userId) {
		let userData = {}
		this.users.forEach((user, index) => {
			if (this.users[index].userId === userId) {
				userData = this.users[index]
			}
		 
		})
		return userData
	}

	getUsersList () { 
		return this.users
	}

}

module.exports = {
	AppUsers
}