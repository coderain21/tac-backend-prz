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
    console.log('template', templateData)
    const params = {
        Content: {
            Template: {
                TemplateArn: templateArn,
                TemplateData: templateData,
            },
        },
        FromEmailAddress: 'shrinit.poojary@7edge.com',
        Destination: {
            ToAddresses: [destinationId],
        },
    }
    console.log(params.Content.Template)
    console.log(JSON.stringify(params), 'params')
    try {
        const response = await pinpoint.sendEmail(params).promise()
        console.log('Email sent successfully:', response)
    } catch (error) {
        console.error('Failed to send email:', error)
    }
}

module.exports.sqsTriggerFunction = async (event) => {
    try {
        console.log('event', event)

        const parsedRecords = event.Records.map((record) => ({
            ...record,
            body: JSON.parse(record.body),
        }))
        console.log('parsed', JSON.stringify(parsedRecords))

        const connection = await mongodbHelper.connect()
        const getBidders = await mongodbHelper.getBidders(parsedRecords[0].body[0])
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
        const getAllLots = await getLot('lot', client, parsedRecords[0].body[0])
        const get_lot = []
        for (let i = 0; i < getAllLots.length; i++) {
            get_lot.push(JSON.parse(getAllLots[i]))
        }
        console.log('lot from redis', get_lot)
        // const uniqueWinningUsers = [...new Set(get_lot.map((item) => item.winning_user))]
        const auctionData = await mongodbHelper.getAuction(parsedRecords[0].body[0])
        const promiseList = []

        for (const user of getBidders) {
            const winningLot = []
            const notWinning = []
            const query = {
                _id: new ObjectId(user.buyer_id), // Replace 'excluded_buyer_id' with the buyer_id you want to exclude
            }
            const sellerQuery = {
                email_address: parsedRecords[0].body[0].seller_email,
            }
            const buyerInformation = await mongodbHelper.getUser(query, process.env.BUYERS_TABLE)
            const sellerInformation = await mongodbHelper.getUser(sellerQuery, process.env.SELLERS_TABLE)
            get_lot.map((item) => {
                item.lot_image = `https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/${item.images[0].url}`
                if (item.winning_user === user.buyer_id) {
                    console.log('itemm', item)
                    item.logo_image = auctionData[0].logo_image === ''
                        ? 'https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/Logo.png'
                        : `https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/${auctionData[0].logo_image}`
                    item.bid_amount = formatCurrency(item.bid_amount, auctionData[0].currency)
                    winningLot.push(item)
                } else if (item.winning_user !== user.buyer_id) {
                    console.log('elseeeeeee', item)
                    item.logo_image = auctionData[0].logo_image === ''
                        ? 'https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/Logo.png'
                        : `https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/${auctionData[0].logo_image}`
                    console.log('itemsss', item)
                    item.bid_amount = formatCurrency(item.starting_price, auctionData[0].currency)
                    notWinning.push(item)
                }
            })
            console.log('buyerInformation', notWinning)

            const template_data = {
                url: 'sdhfjk',
                winning_lot: winningLot,
                winning_lot_count: winningLot.length,
                buyer: buyerInformation[0].first_name === '' ? 'Customer' : `${buyerInformation[0].first_name} ${buyerInformation[0].last_name}`,
                title: auctionData[0].title,
                logo_url: auctionData[0].logo_image === '' ? 'https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/Logo.png' : `https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/${auctionData[0].logo_image}`,
                not_winning_lot: notWinning,
                not_winning_lot_count: notWinning.length,
                seller_name: sellerInformation[0].first_name === '' ? 'User' : `${sellerInformation[0].first_name} ${sellerInformation[0].last_name}`,
                seller_email: auctionData[0].seller_email,
            }
            promiseList.push(sendMail(user.email_address, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), 'arn:aws:mobiletargeting:eu-west-2:929441721738:templates/send-auction-completion-email/EMAIL'))
            // await sendMail(user, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), 'arn:aws:mobiletargeting:eu-west-2:929441721738:templates/send-auction-completion-email/EMAIL')
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
