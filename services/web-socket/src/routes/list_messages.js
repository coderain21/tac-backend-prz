const CustomerChat = require('../models/CustomerChat')
const moment = require('moment')

module.exports.listMessages = async (socket, io, data, callback, userData, users) => {
    const startDate = new Date(moment(new Date(Date.now())).startOf('day').toString())
    const endDate = new Date(moment(new Date(Date.now())).endOf('day').toString())
    const chats = await CustomerChat.find({ 
        $or: [
            { chatSenderId: data.chatSenderId },
            { chatReceiverId: data.chatReceiverId }, 
            { chatSenderId: data.chatReceiverId },
            { chatReceiverId: data.chatSenderId
        }], 
        chatSessionId: data.chatSessionId, 
        createdAt: {
            $gte: startDate,
            $lte: endDate,
        },
        deleted: false,
    })
    const chatList = []
    if (chats) {
        chats.forEach((chat, chatIndex) => {
            chatList.push({
                chatId: chat._id,
                chatContent: chat.chatContent,
                chatDateTime: chat.chatDateTime,
                chatSenderId: chat.chatSenderId,
                chatSessionId: chat.chatSessionId,
                chatAttachment: chat.chatAttachment,
                chatReceiverId: chat.chatReceiverId,
                chatLocalId: chat.chatLocalId,
                chatContentType: chat.chatContentType
            })
        })
    } 
    return io.to(socket.id).emit('getMyChatList', JSON.stringify({ status: true, data: chatList }))
}