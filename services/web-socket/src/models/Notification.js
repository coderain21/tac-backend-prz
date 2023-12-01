const mongoose = require('mongoose')
const Schema = mongoose.Schema

const NotificationSchema = new Schema({
    notificationTitle: { type: String, required: false, trim: true },
    notificationDescription: { type: String, required: false, trim: true },
    notificationType: { type: Number, required: false, trim: true },
    notificationOrderId: { type: String, required: false, default: '' },
    notificationScope: { type: Number, required: false, trim: true },
    notificationImageUrl: { type: String, required: false, trim: true, default: undefined },
    notificationReceivedList: { type: Array, required: false, trim: true, default: [] },
    notificationReadList: { type: Array, required: false, trim: true, default: [] },
    notificationCreatedAt: { type: Date, required: false, default: Date.now, trim: true },
    notificationStatus: { type: String, required: false, trim: true },
    notificationReceiverId: { type: String, required: false, trim: true },
    notificationRead: { type: Boolean, required: false, default: false },
    notificationSenderInfo: { 
        userId: { type: String, required: false, index: true, default: '' },
        userFirstName: { type: String, required: false, index: true, default: '' },
        userLastName: { type: String, required: false, index: true, default: '' },
        userImageUrl: { type: String, required: false, index: true },
        partnerImageUrl: { type: String, index: true, required: false },
        partnerCommercialName: { type: String, required: false },
    },
    notificationReceiverInfo: {
        userId: { type: String, required: false, index: true, default: '' },
        userFirstName: { type: String, required: false, index: true, default: '' },
        userLastName: { type: String, required: false, index: true, default: '' },
        userImageUrl: { type: String, required: false, index: true },
        partnerImageUrl: { type: String, index: true, required: false },
        partnerCommercialName: { type: String, required: false },
    },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },
    deleted: { type: Boolean, default: false }
})

const Notifications = mongoose.model('Notifications', NotificationSchema)
module.exports = Notifications