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
const redis = require('redis')

const {
    PinpointEmail,
} = require('aws-sdk')
const { ObjectId } = require('mongodb')
const Auction = require('../entities/Auction')
const mongodbHelper = require('../lib/mongodb_helper')

const pinpoint = new PinpointEmail()

async function getLot(rediskey, client, auctionData) {
    console.log('auction_data', auctionData)
    const allBidders = await client.hGetAll('lot', rediskey)
    return Object.values(allBidders || {}).filter((bidder) => {
        const parsedBidder = JSON.parse(bidder)
        return parsedBidder.seller_email === auctionData.seller_email && parsedBidder.auction_id === auctionData.auction_id
    })
}

function formatCurrency(amount, currencyCode) {
    console.log('amount', amount)
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
    }).format(amount)
}

async function sendMail(destinationId, sourceId, templateData, templateArn) {
    console.log(templateArn)
    console.log('template', destinationId)
    const params = {
        Content: {
            Template: {
                TemplateArn: templateArn,
                TemplateData: templateData,
            },
        },
        FromEmailAddress: 'no-reply@indy.auction',
        Destination: {
            ToAddresses: [destinationId],
        },
    }
    console.log(JSON.stringify(params), 'params')
    try {
        const response = await pinpoint.sendEmail(params).promise()
        console.log('Email sent successfully:', response)
    } catch (error) {
        console.error('Failed to send email:', error)
    }
}

/**
 * The function `sqsTriggerFunction` is an AWS Lambda handler designed to process events triggered
 * by an SQS (Simple Queue Service) queue. It performs various tasks related to email notifications,
 * lot processing, and data retrieval.
 * @param event - The `event` parameter represents the incoming event triggered by SQS. It typically
 * contains information about the event triggering the function.
 */
module.exports.sqsTriggerFunction = async (event, context) => {
    try {
        console.log('parsed', JSON.stringify(event))
        const connection = await mongodbHelper.connect()
        const getBidders = await mongodbHelper.getBidders(event)
        console.log('get', getBidders)
        // const getLots = await mongodbHelper.getAuctionLots(event)
        // console.log('getting lots', getLots)
        const client = await redis.createClient({
            url: process.env.REDIS_URL,
        }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        // const client = await redis.createClient()
        if (!client.isOpen) {
            await client.connect()
        }
        const getAllLots = await getLot('lot', client, event)
        const get_lot = []
        for (let i = 0; i < getAllLots.length; i++) {
            get_lot.push(JSON.parse(getAllLots[i]))
        }
        console.log('lot from redis', get_lot)
        // const uniqueWinningUsers = [...new Set(get_lot.map((item) => item.winning_user))]
        const auctionData = await mongodbHelper.getAuction(event, process.env.TABLE_NAME)
        const promiseList = []
        for (const user of getBidders) {
            console.log('inside loop', user)
            const winningLot = []
            const notWinning = []
            const query = {
                _id: new ObjectId(user.buyer_id), // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
            }
            const sellerQuery = {
                email_address: event.seller_email,
            }
            const buyerInformation = await mongodbHelper.getUser(query, process.env.BUYERS_TABLE)
            const sellerInformation = await mongodbHelper.getUser(sellerQuery, process.env.SELLERS_TABLE)
            let subjectDescription = 'You Won the Auction'
            get_lot.map((item) => {
                item.lot_image = `${process.env.CDN_LINK}${item.images[0].url}`
                if (item.winning_user === user.buyer_id) {
                    // item.lot_image = item.images[0].url === ''
                    //     ? '${process.env.CDN_LINK}Logo.png'
                    //     : `${process.env.CDN_LINK}${item.images[0].url}`
                    // console.log('logo image', item.lot_image, item.images[0])
                    console.log('itemss', item.lot_image)
                    item.bid_amount = formatCurrency(item.bid_amount, auctionData[0].currency)
                    winningLot.push(item)
                } else if (item.winning_user !== user.buyer_id) {
                    console.log('elseeeeeee', item)
                    // item.lot_image = item.images[0].url === ''
                    //     ? '${process.env.CDN_LINK}Logo.png'
                    //     : `${process.env.CDN_LINK}${item.images[0].url}`
                    // console.log('itemsss', item)
                    item.bid_amount = formatCurrency(item.starting_price, auctionData[0].currency)
                    console.log('itemss', item.lot_image)
                    notWinning.push(item)
                }
            })
            if (winningLot.length <= 0) {
                subjectDescription = 'You lost the Auction'
            }
            console.log('buyerInformation', notWinning)
            const template_data = {
                winning_lot: winningLot,
                winning_lot_count: winningLot.length,
                buyer: buyerInformation[0].first_name === '' ? 'Customer' : `${buyerInformation[0].first_name} ${buyerInformation[0].last_name}`,
                title: auctionData[0].title,
                logo_url: auctionData[0].logo_image === '' ? `${process.env.CDN_LINK}Logo.png` : `${process.env.CDN_LINK}${auctionData[0].logo_image}`,
                not_winning_lot: notWinning,
                not_winning_lot_count: notWinning.length,
                seller_name: sellerInformation[0].first_name === '' ? 'User' : `${sellerInformation[0].first_name} ${sellerInformation[0].last_name}`,
                seller_email: auctionData[0].seller_email,
                subject: subjectDescription,
            }
            const currentAccountId= context.invokedFunctionArn.split(':')[4]
            console.log(currentAccountId)
            promiseList.push(sendMail(user.email_address, process.env.SES_SENDER_EMAIL_ID, JSON.stringify(template_data), `arn:aws:mobiletargeting:eu-west-2:${currentAccountId}:templates/send-auction-completion-email/EMAIL`))
        }
        const response = await Promise.all(promiseList)
        console.log('response', response)
        const request_body = {
            status: 'Completed',
        }
        const updateAuction = await mongodbHelper.update(Auction, auctionData[0]._id, request_body)
        console.log('update', updateAuction)
        await connection.disconnect()
    } catch (err) {
        console.log('err', err)
    }
}
