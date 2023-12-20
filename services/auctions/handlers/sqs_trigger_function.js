/* eslint-disable no-console */
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
const mongodbHelper = require('../lib/mongodb_helper')

const pinpoint = new PinpointEmail()

/**
 * The function `getLot` retrieves all bidders for a specific lot based on the provided Redis key,
 * client, and auction data.
 * @param rediskey - The `rediskey` parameter is a key used to identify a specific lot in Redis. It is
 * used to retrieve the lot data from Redis.
 * @param client - The `client` parameter is likely an instance of a Redis client, which is used to
 * interact with a Redis server. It is used to execute Redis commands, such as `hGetAll`, which
 * retrieves all fields and values from a hash stored at a given key.
 * @param auctionData - The `auctionData` parameter is an object that contains information about the
 * auction. It likely includes properties such as `seller_email` and `auction_id`, which are used to
 * filter the bidders.
 * @returns an array of bidders that match the conditions specified in the filter function.
 */
async function getLot(rediskey, client, auctionData) {
    const allBidders = await client.hGetAll('lot', rediskey)
    return Object.values(allBidders || {}).filter((bidder) => {
        const parsedBidder = JSON.parse(bidder)
        return parsedBidder.seller_email === auctionData.seller_email && parsedBidder.auction_id === auctionData.auction_id
    })
}

/**
 * The function `sendMail` sends an email using the AWS Pinpoint service, with the specified
 * destination, source, template data, and template ARN.
 * @param destinationId - The `destinationId` parameter represents the email address of the recipient
 * to whom the email will be sent.
 * @param sourceId - The sourceId parameter represents the email address or identity that you want to
 * send the email from. In this case, it is set to 'shrinit.poojary@7edge.com'.
 * @param templateData - The `templateData` parameter is a JSON object that contains the data to be
 * used in the email template. This data will be used to populate the placeholders in the email
 * template with actual values.
 * @param templateArn - The `templateArn` parameter is the Amazon Resource Name (ARN) of the email
 * template that you want to use for sending the email. The ARN uniquely identifies the template in
 * Amazon Pinpoint.
 */
async function sendMail(destinationId, sourceId, templateData, templateArn) {
    const params = {
        Content: {
            Template: {
                TemplateArn: templateArn,
                TemplateData: templateData,
            },
        },
        FromEmailAddress: ProcessCredentials.env.SENDER_EMAIL_ADDRESS,
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

/**
 * The function `sqsTriggerFunction` is an AWS Lambda handler designed to process events triggered
 * by an SQS (Simple Queue Service) queue. It performs various tasks related to email notifications,
 * lot processing, and data retrieval.
 * @param event - The `event` parameter represents the incoming event triggered by SQS. It typically
 * contains information about the event triggering the function.
 */
module.exports.sqsTriggerFunction = async (event) => {
    try {
        console.log('event', event)
        const parsedRecords = event.Records.map((record) => ({
            ...record,
            body: JSON.parse(record.body),
        }))
        const getBidders = await mongodbHelper.getBidders(parsedRecords[0].body[0])
        // const getLots = await mongodbHelper.getAuctionLots(event)
        // console.log('getting lots', getLots)
        const client = await redis.createClient({
            url: process.env.REDIS_URL,
        }).on('error', (err) => console.log('Redis Client Error', err)).connect()
        if (!client.isOpen) {
            await client.connect()
        }
        const getAllLots = await getLot('lot', client, parsedRecords[0].body[0])
        const get_lot = []
        for (let i = 0; i < getAllLots.length; i++) {
            get_lot.push(JSON.parse(getAllLots[i]))
        }
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
                    winningLot.push(item)
                } else if (item.winning_user !== user.buyer_id) {
                    notWinning.push(item)
                }
            })
            const template_data = {
                winning_lot: winningLot,
                winning_lot_count: winningLot.length,
                buyer: buyerInformation[0].first_name === '' ? 'Customer' : `${buyerInformation[0].first_name}${buyerInformation[0].last_name}`,
                title: auctionData[0].title,
                not_winning_lot: notWinning,
                not_winning_lot_count: notWinning.length,
                seller_name: sellerInformation[0].first_name === '' ? 'Seller' : `${sellerInformation[0].first_name}${sellerInformation[0].last_name}`,
                seller_email: auctionData[0].seller_email,
            }
            promiseList.push(sendMail(user.email_address, process.env.SENDER_EMAIL_ADDRESS, JSON.stringify(template_data), 'arn:aws:mobiletargeting:eu-west-2:929441721738:templates/send-auction-completion-email/EMAIL'))
        }
        const response = await Promise.all(promiseList)
        console.log('response', response)
    } catch (err) {
        console.log('err', err)
    }
}
