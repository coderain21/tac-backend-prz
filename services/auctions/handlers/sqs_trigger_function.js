/* eslint-disable no-restricted-globals */
/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable no-plusplus */
/* eslint-disable no-param-reassign */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-restricted-syntax */
/* eslint-disable camelcase */
/* eslint-disable array-callback-return */
/* eslint-disable no-await-in-loop */

const {
    PinpointEmail,
} = require('aws-sdk')
const { ObjectId } = require('mongodb')
const Auction = require('../entities/Auction')
const mongodbHelper = require('../lib/mongodb_helper')
const redisHelper = require('../lib/redis_helper')

const pinpoint = new PinpointEmail()

let connection
async function getLot(rediskey, client, auctionData) {
    const allBidders = await client.hget('lot', rediskey)
    return Object.values(allBidders || {}).filter((bidder) => {
        const parsedBidder = JSON.parse(bidder)
        return parsedBidder.seller_email === auctionData.seller_email && parsedBidder.auction_id === auctionData.auction_id
    })
}

function formatCurrency(amount, currencyCode) {
    try {
        console.log('amountttt', amount)

        // Convert amount to a string
        const amountString = String(amount)

        // Remove currency symbol and commas
        const cleanedAmount = amountString.replace(/[^\d.]/g, '')

        const parsedAmount = parseFloat(cleanedAmount)

        if (isNaN(parsedAmount)) {
            console.error('Invalid amount:', amountString)
            return 'Invalid amount'
        }

        // Include commas and currency symbol in the formatted result
        const formattedAmount = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2, // Adjust as needed
            maximumFractionDigits: 2, // Adjust as needed
        }).format(parsedAmount)

        return formattedAmount
    } catch (err) {
        console.error(err)
        return 'Error formatting currency'
    }
}

async function sendMail(destinationId, sourceId, templateData, templateArn) {
    const params = {
        Content: {
            Template: {
                TemplateArn: templateArn,
                TemplateData: templateData,
            },
        },
        FromEmailAddress: process.env.SENDER_EMAIL,
        Destination: {
            ToAddresses: [destinationId],
        },
    }
    try {
        await pinpoint.sendEmail(params).promise()
    } catch (error) {
        console.error('Failed to send email:', error)
    }
}

module.exports.sqsTriggerFunction = async (event) => {
    try {
        connection = await mongodbHelper.connect()
        const getBidders = await mongodbHelper.getBidders(event)
        const client = await redisHelper.createRedisClient()
        const getAllLots = await getLot('lot', client, event)
        const get_lot = getAllLots.map((item) => JSON.parse(item))

        const auctionData = await mongodbHelper.getAuction(event, process.env.TABLE_NAME)

        const promiseList = getBidders.map(async (user) => {
            const winningLot = []
            const notWinning = []
            const query = {
                _id: new ObjectId(user.buyer_id),
            }
            const sellerQuery = {
                email_address: event.seller_email,
            }
            const buyerInformation = await mongodbHelper.getUser(query, process.env.BUYERS_TABLE)
            const sellerInformation = await mongodbHelper.getUser(sellerQuery, process.env.SELLERS_TABLE)
            let subjectDescription = 'You Won the Auction'
            get_lot.forEach((item) => {
                item.lot_image = `${process.env.CDN_LINK}${item.images[0].url}`
                if (item.winning_user === user.buyer_id) {
                    item.bid_amount = formatCurrency(item.bid_amount, auctionData[0].currency)
                    winningLot.push(item)
                } else if (item.winning_user !== user.buyer_id) {
                    item.bid_amount = formatCurrency(item.starting_price, auctionData[0].currency)
                    notWinning.push(item)
                }
            })

            if (winningLot.length <= 0) {
                subjectDescription = 'You lost the Auction'
            }
            console.log('winningLot', winningLot)

            const template_data = {
                winning_lot: winningLot.sort((a, b) => a.lot_number - b.lot_number),
                winning_lot_count: winningLot.length,
                buyer: buyerInformation[0].first_name === '' ? 'Customer' : `${buyerInformation[0].first_name} ${buyerInformation[0].last_name}`,
                title: auctionData[0].title,
                logo_url: auctionData[0].logo_image === '' ? `${process.env.S3_BUCKET_URL}/Logo.png` : `${process.env.S3_BUCKET_URL}/${auctionData[0].logo_image}`,
                not_winning_lot: notWinning.sort((a, b) => a.lot_number - b.lot_number),
                not_winning_lot_count: notWinning.length,
                seller_name: sellerInformation[0].first_name === '' ? 'User' : `${sellerInformation[0].first_name} ${sellerInformation[0].last_name}`,
                seller_email: auctionData[0].seller_email,
                subject: subjectDescription,
            }

            return 
            // sendMail(user.email_address, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), process.env.TEMPLATE_ARN_AUCTION_COMPLETION)
        })

        await Promise.all(promiseList)

        await mongodbHelper.update(Auction, auctionData[0]._id, { status: 'Completed' })
    } catch (err) {
        console.log('err', err)
    } finally {
        if (connection) {
            await connection.disconnect()
        }
    }
}
