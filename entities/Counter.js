/* eslint-disable no-undef */
const mongoose = require('mongoose')

const { Schema } = mongoose

const stage = process.env.STAGE

const CounterSchema = new Schema({
    _id: { type: String, required: true },
    sequence_id: { type: String },
    auction_id: {
        type: Schema.Types.ObjectId, trim: true,
    },
<<<<<<< Updated upstream
    seller_email: { type: String, default: '' },
=======
    seller_email: { type: String, default: '', uppercase: true },
>>>>>>> Stashed changes
    record_type: { type: String, default: '' },
    prefix: { type: String, default: '', uppercase: true },
    suffix: { type: String, default: '', uppercase: true },
    status: { type: String, default: 'Active' },
    starting_sequence: { type: Number, default: 0 },
    sequence_length: { type: Number, default: 0 },
})

CounterSchema.index({ _id: 1, prefix: 1, suffix: 1 }, { unique: true })
const Counter = mongoose.model(`${stage}-counters`, CounterSchema)

module.exports = Counter
