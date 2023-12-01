/* eslint-disable import/order */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-tabs */
/**
 * @description - NPM Dependencies
 */
const express = require('express')
const http = require('http')
const bodyParser = require('body-parser')
const socketIO = require('socket.io')
const cors = require('cors') // Add this line

const { initiateEvents } = require('./src/app')
const { AppUsers } = require('./src/models/AppConnection')

const port = process.env.PORT || 8080
const app = express() // Change this line
app.use(cors()) // Add this line
app.use(bodyParser.urlencoded({ extended: true }))

const server = http.createServer(app)

server.listen(port, () => {
    console.log(`http://localhost:${port}`)
})

// const io = socketIO(server)
const io = require('socket.io')(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
})

const users = new AppUsers()

io.on('connection', async (socket) => {
    /**
	 * @eventType - AUTH_VALIDATION
	 * @description -Function to authenticate client connection before initiating socket events
	 * @param { Object }
	 * @returns { Object }
	 */
    console.log('===========================')
    console.log('SOCKET :: ')
    console.log('===========================')
    const obj = JSON.parse(JSON.stringify(socket.handshake.query))
    console.log('object', obj)
    // const authStatus = await mobileAuthenticated(obj)
    // console.log('authStatus', authStatus)
    // if (authStatus) {
    //     console.log('emitiinh')
    //     socket.emit('unAuthorized', JSON.stringify({ status: false, message: 'unauthorised' }))
    //     return socket.disconnect()
    // }

    /**
	 * @event - DISCONNECT
	 * @eventDescription -
	 * 	* Event will be triggered when client gets disconnected from the server
	 * 	* Server clears connection data from the connection stack
	 * @eventType - Private
	 */
    socket.on('disconnect', (data) => {
        console.log('Users List before')
        users.removeUser(socket.id)
        console.log('Users List After')
        return socket.disconnect()
    })

    users.addUser(socket.id, obj.userId)
    console.log('users', users)
    /**
	 * @event - CONNECTION_INITIATE
	 * @eventDescription -
	 * 	* This function will be invoked once client get authenticated
	 * @eventType - Private
	 */
    // const userData = authStatus.data
    // console.log(users.getUsersList())
    return initiateEvents(socket, io, users)
})
