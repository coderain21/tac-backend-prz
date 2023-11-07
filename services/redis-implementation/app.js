/* eslint-disable import/no-extraneous-dependencies */
const io = require('socket.io-client')
// First Connect to the Server on the Specific URL (HOST:PORT)
const socket = io('http://localhost:3000')
// Now Listen for Events (welcome event).
socket.on('connect-to-client', (data) => {
    console.log('dd', data)
    // const dataX = {
    //     buyer_id: 'buyer1234',
    //     name: 'sandhya',
    //     amount: '$300',
    // }
    // socket.emit('place-a-bid', JSON.stringify(dataX))
    const reqBody = {
        buyer_id: 'anusha.k+op843@7edge.com',
        auction_id: '6538925a84bf4cc56b8c4cce',
        seller_email: 'anusha.k+newacc@7edge.com',
    }
    socket.emit('connect-to-auction', JSON.stringify(reqBody))
})

socket.on('disconnect', () => {
    console.log('Socket Connection is Disconnected')
})
