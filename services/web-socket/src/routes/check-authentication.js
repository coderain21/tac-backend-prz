const { checkBuyerAuthentication } = require('../utilities/authService')

module.exports.checkAuthentication = async (socket, data) => {
    const checkUser = await checkBuyerAuthentication(data)
    let response = 'User Not Authenticated'
    if (checkUser) {
        response = 'User Authenticated'
    }

    socket.emit('checkAuthentication', { status: true, data: response })
}
