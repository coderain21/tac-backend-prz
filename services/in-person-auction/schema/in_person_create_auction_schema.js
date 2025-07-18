const Joi = require('joi')

// Define nested object schemas for better validation
const colorSchema = Joi.object({
    background_color: Joi.string().allow('').optional(),
    text_color: Joi.string().allow('').optional(),
}).optional()

const fontSchema = Joi.object({
    hearder_font: Joi.string().allow('').optional(), // Note: keeping the typo "hearder" as it exists in your data
    body_font: Joi.string().allow('').optional(),
}).optional()

// eslint-disable-next-line no-unused-vars
const locationSchema = Joi.object({
    address: Joi.string().allow('').optional(),
    latitude: Joi.string().allow('').optional(),
    longitude: Joi.string().allow('').optional(),
}).optional()

const auctionSchema = Joi.object({
    // Basic auction info
    title: Joi.string().allow('').optional(),
    currency: Joi.string().allow('').optional(),
    auction_image: Joi.alternatives().try(Joi.string(), Joi.object()).optional(),
    description: Joi.string().allow('').optional(),
    auction_type: Joi.string().allow('').optional(),

    // Template and branding
    template_name: Joi.string().allow('').optional(),
    logo_image: Joi.string().allow('').optional(),
    logo_redirection_url: Joi.string().allow('').optional(),

    // Menu and navigation
    menu_links: Joi.array().optional(),

    // Dates and timing
    start_date: Joi.number().allow(null).optional(),
    end_date: Joi.number().allow(null).optional(),
    first_lot_end_date: Joi.number().allow(null).optional(),
    time_zone: Joi.string().allow('').optional(),
    extension_type: Joi.string().allow('').optional(),
    extension_time: Joi.string().allow('').optional(),
    extension_time_between_lots: Joi.string().allow('').optional(),

    // Registration and fees
    registration_type: Joi.string().allow('').optional(),
    add_buyer_fees: Joi.string().allow('').optional(),
    percentage: Joi.string().allow('').optional(),
    fees: Joi.string().allow('').optional(),

    // Location and timezone objects (Mixed type in schema)
    location: Joi.object().optional(),
    start_time_zone: Joi.object().optional(),
    end_time_zone: Joi.object().optional(),

    // Content
    faq: Joi.array().optional(),
    terms_and_condition: Joi.string().allow('').optional(),
    note: Joi.string().allow('').optional(),

    // Settings and toggles
    publish_auction_results: Joi.boolean().optional(),
    show_bidding_history: Joi.boolean().optional(),
    toggle_powered_by_indy: Joi.boolean().optional(),
    make_your_auction_private: Joi.boolean().optional(),
    hide_auction_lots: Joi.boolean().optional(),
    show_bidder_location_in_bidder_history: Joi.boolean().optional(),
    passcode: Joi.string().allow('').optional(),

    // Bidding options
    accept_absentee_bids: Joi.boolean().optional(),
    accept_telephone_bids: Joi.boolean().optional(),

    // Styling
    font: fontSchema,
    buttons: colorSchema,
    header: colorSchema,
    content_area: colorSchema,
    footer: colorSchema,
    paddle: colorSchema,

    // System fields (usually not sent in requests, but might be present)
    auction_id: Joi.string().optional(),
    seller_email: Joi.string().email().optional(),
    seller_name: Joi.string().optional(),
    status: Joi.string().allow('').optional(),
    created_at: Joi.date().optional(),
    updated_at: Joi.date().optional(),
    __v: Joi.number().optional(),
    _id: Joi.object().optional(),
})

module.exports = { auctionSchema }
