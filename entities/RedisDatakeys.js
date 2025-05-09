const mongoose = require('mongoose')

const RedisDataKeysSchema = new mongoose.Schema({
    lot_key: {
        type: String,
        required: false, // Assuming keys might not always be present
    },
    lot_history_key: {
        type: String,
        required: false,
    },
    auction_history_key: {
        type: String,
        required: false,
    },
    created_at: {
        type: Number, // Storing as Unix timestamp (seconds)
        required: true,
        default: () => Math.floor(Date.now() / 1000), // Default to current time in seconds
    },
}, {
    timestamps: true, // Adds createdAt and updatedAt mongoose-managed timestamps
})

// Indexing created_at for faster querying of old documents
RedisDataKeysSchema.index({ created_at: 1 })

module.exports = mongoose.model('redis-data-keys', RedisDataKeysSchema, 'redis-cron-data')
