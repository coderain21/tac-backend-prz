/* eslint-disable no-restricted-syntax */
/* eslint-disable camelcase */
/* eslint-disable array-callback-return */
/* eslint-disable no-await-in-loop */
// const redis = require('redis')

const {
    config, PinpointEmail,
} = require('aws-sdk')

const pinpoint = new PinpointEmail()

// async function getLot(rediskey, client, auctionData) {
//     const allBidders = await client.hGetAll('lot', rediskey)
//     return Object.values(allBidders || {}).filter((bidder) => {
//         const parsedBidder = JSON.parse(bidder)
//         return parsedBidder.seller_email === auctionData.seller_email && parsedBidder.auction_id === auctionData.seller_email
//     })
// }

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
        // const client = await redis.createClient({
        //     url: process.env.REDIS_URL,
        // }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        // if (!client.isOpen) {
        //     await client.connect()
        // }
        // const getAllLots = await getLot('lot', client, event)
        // const get_lot = []
        // for (let i = 0; i < getAllLots.length; i++) {
        //     get_lot.push(JSON.parse(getAllLots[i]))
        // }
        const get_lot = [{
            winning_user: 'sandhyashri@7edge.com',
            title1: 'LOt1',
            bid_amount: 150,
        },
        {
            winning_user: 'sandhyashri+test@7edge.com',
            title1: 'LOt1',
            bid_amount: 150,
        }]
        console.log('lot from redis', get_lot)
        const uniqueWinningUsers = [...new Set(get_lot.map((item) => item.winning_user))]
        for (const user of uniqueWinningUsers) {
            const winningLot = []
            get_lot.map((item) => {
                if (item.winning_user === user) {
                    winningLot.push(item)
                }
            })
            const template_data = {
                url: 'sdhfjk',
                winning_lot: winningLot,
                buyer: user,
            }
            await sendMail(user, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), 'arn:aws:mobiletargeting:eu-west-2:929441721738:templates/send-auction-completion-email/EMAIL')
        }
    } catch (err) {
        console.log('err', err)
    }
}
