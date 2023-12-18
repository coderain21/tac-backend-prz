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

async function sendMail(destinationId, sourceId, templateData, templateArn) {
    console.log(templateArn)
    const params = {
        Content: {
            Template: {
                TemplateArn: templateArn,
                TemplateData: templateData,
            },
        },
        FromEmailAddress: 'shrinit.poojary@7edge.com',
        Destination: {
            ToAddresses: ['sandhyashri@7edge.com'],
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

module.exports.handler = async (event) => {
    try {
        console.log('event', event)
        const client = await redis.createClient({
            url: process.env.REDIS_URL,
        }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        if (!client.isOpen) {
            await client.connect()
        }
        const getAllLots = await getLot('lot', client, event)
        const get_lot = []
        for (let i = 0; i < getAllLots.length; i++) {
            get_lot.push(JSON.parse(getAllLots[i]))
        }
        console.log('lot from redis', get_lot)
        const uniqueWinningUsers = [...new Set(get_lot.map((item) => item.winning_user))]
        const auctionData = await mongodbHelper.getAuction(event)
        for (const user of uniqueWinningUsers) {
            const winningLot = []
            const notWinning = []
            get_lot.map((item) => {
                if (item.winning_user === user) {
                    console.log('itemm', item)
                    item.lot_image = `https://indy-auction-dev-assets.s3.eu-west-2.amazonaws.com/public/${item.images[0].url}`
                    winningLot.push(item)
                } else {
                    notWinning.push(item)
                }
            })
            console.log('winninglir', winningLot, user)
            const template_data = {
                url: 'sdhfjk',
                winning_lot: winningLot,
                buyer: user,
                title: auctionData[0].title,
                not_winning_lot: notWinning,
            }
            await sendMail(user, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), 'arn:aws:mobiletargeting:eu-west-2:929441721738:templates/send-auction-completion-email/EMAIL')
        }
    } catch (err) {
        console.log('err', err)
    }
}
