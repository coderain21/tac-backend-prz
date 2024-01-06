/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
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
const { authenticationCheck } = require('./src/utilities/authService')

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

io.on('connection', async (socket, data) => {
    /**
	 * @eventType - AUTH_VALIDATION
	 * @description -Function to authenticate client connection before initiating socket events
	 * @param { Object }
	 * @returns { Object }
	 */
    console.log('===========================')
    console.log('===========================')
    // const token = JSON.parse(JSON.stringify(socket.handshake.query.token))
    // const authStatus = await authenticationCheck(token)
    // console.log('authStatus', authStatus)
    // if (authStatus.statusCode === 401) {
    //     console.log('emitiinh')
    //     socket.emit('connection', JSON.stringify({ status: false, message: 'unauthorized' }))
    //     // return socket.disconnect()
    // }

    /**
	 * @event - DISCONNECT
	 * @eventDescription -
	 * 	* Event will be triggered when client gets disconnected from the server
	 * 	* Server clears connection data from the connection stack
	 * @eventType - Private
	 */
    socket.on('disconnect', (data1) => {
        console.log('Users List before')
        users.removeUser(socket.id)
        console.log('Users List After')
        return socket.disconnect()
    })

    users.addUser(socket.id)
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
