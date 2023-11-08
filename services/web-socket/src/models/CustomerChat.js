const mongoose = require('mongoose')
const Schema = mongoose.Schema

const CustomerChatSchema = new Schema({
    chatContent: { type: String, required: false, trim: true },
    chatAttachment: { type: String, required: false, trim: true },
    chatDateTime: { type: Date, default: Date.now, index: true },
    chatSessionId: { type: String, required: false, trim: true },
    chatContentType: { type: Number, required: false },
    chatSenderId: { type: String, required: false, trim: true },
    chatReceiverId: { type: String, required: false, trim: true },
    chatLocalId: { type: String, required: false, trim: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    deleted: { type: Boolean, default: false }
})

const CustomerChat = mongoose.model('CustomerChat', CustomerChatSchema)
module.exports = CustomerChat
