import Module from 'module';
import path from 'path';
import { test, expect } from '@playwright/test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';
import { LambdaEventFactory } from '../lib/lambda_event_factory';
import { connectToDatabase, closeDatabaseConnection } from '../lib/db_helper';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- MONKEY-PATCH TO FIX BROKEN REQUIRE PATHS ---
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
  const rootDir = path.resolve(__dirname, '../../');
  if (parent && parent.filename.includes('services/in-person-buyer/handlers/place_bid.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};
// --- END OF PATCH ---

loadEnvironmentVariables('services/in-person-buyer/');

// Importing using require due to handler export style
const { place_bid } = require('../../services/in-person-buyer/handlers/place_bid.js');

test.describe('In Person Auction Place Bid handler tests', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME!;
  const auctionId = 'A-CLASSIC';
  const lotId = 'LOT123';
  const buyerId = '67c83dc1833d0eb25ef7fc12';
  
  let queryLotId: string;
  let queryBuyerId: string;
  let queryAuctionObjectId: string;

  // Helper function to wait for data to exist
  async function waitForDataToExist(collection: any, query: any, maxRetries = 10, delayMs = 100) {
    for (let i = 0; i < maxRetries; i++) {
      const doc = await collection.findOne(query);
      if (doc) {
        return doc;
      }
      await delay(delayMs);
    }
    throw new Error(`Data not found after ${maxRetries} retries: ${JSON.stringify(query)}`);
  }

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_CLIENT!);
    await client.connect();
    db = client.db(process.env.DATABASE);
  });

  test.afterAll(async () => {
    await closeDatabaseConnection();
  });

  test.beforeEach(async () => {
    const users = db.collection(`${process.env.STAGE}-users`);
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const buyers = db.collection(`${process.env.STAGE}-buyers`);
    const liveBids = db.collection(`${process.env.STAGE}-live-bids`);
    const registeredUsers = db.collection(`${process.env.STAGE}-register-auctions`);

    // Write concern for consistency
    const insertOptions = { 
      writeConcern: { w: 'majority', j: true } 
    };

    await users.deleteMany({});
    await auctions.deleteMany({});
    await lots.deleteMany({});
    await buyers.deleteMany({});
    await liveBids.deleteMany({});
    await registeredUsers.deleteMany({});

    // Insert user
    await users.insertOne({
      email_address: sellerEmail,
      first_name: 'Api',
      last_name: 'User',
      seller_id: 'S-API'
    }, insertOptions);

    // Insert auctions
    const auctionData = await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Published',
      start_date: Math.floor(Date.now()) + (72 * 60 * 60) // future start date in seconds
    }, insertOptions);

    queryAuctionObjectId = auctionData.insertedId.toString();

    await auctions.insertOne({
      auction_id: 'A-DRAFT',
      seller_email: sellerEmail,
      status: 'Draft',
      start_date: Math.floor(Date.now()) + (72 * 60 * 60)
    }, insertOptions);

    // Insert lot
    const lotData = await lots.insertOne({
      lot_id: lotId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      title: 'Test Lot'
    }, insertOptions);

    queryLotId = lotData.insertedId.toString();

    // Insert buyer
    const buyerData = await buyers.insertOne({
      buyer_id: buyerId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      name: 'Test Buyer',
      email_address: 'buyer@example.com'
    }, insertOptions);

    queryBuyerId = buyerData.insertedId.toString();

    // Register buyer for auction - THIS IS CRITICAL based on your handler
    await registeredUsers.insertOne({
      email_address: 'buyer@example.com',
      auction_id: new ObjectId(queryAuctionObjectId),
      seller_email: sellerEmail,
      registered_at: new Date()
    }, insertOptions);

    // Verify data exists before proceeding
    await waitForDataToExist(lots, { _id: new ObjectId(queryLotId) });
    await waitForDataToExist(buyers, { _id: new ObjectId(queryBuyerId) });
    await waitForDataToExist(auctions, { auction_id: auctionId });
    await waitForDataToExist(registeredUsers, { 
      email_address: 'buyer@example.com', 
      auction_id: new ObjectId(queryAuctionObjectId) 
    });

    await delay(2500); // Additional safety delay
  });

  test('should place a valid bid', async () => {
    const bidData = {
      lot_id: queryLotId,
      buyer_id: queryBuyerId,
      bid_amount: 5000,
      paddle_number: 1,
      auction_id: auctionId,
      bid_type: 'absentee',
      seller_email: sellerEmail
    };

    const event = {
      requestContext: {
        authorizer: {
          claims: {
            'cognito:username': 'buyer@example.com'
          }
        }
      },
      body: JSON.stringify(bidData)
    };

    const response = await place_bid(event);
    console.log('response', response)
    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Bid placed successfully');

    const liveBids = db.collection(`${process.env.STAGE}-live-bids`);
    const savedBid = await liveBids.findOne({ lot_id: queryLotId, buyer_id: queryBuyerId });
    expect(savedBid).not.toBeNull();
    expect(savedBid?.bid_amount).toBe(5000);
  });

//   test('should return 403 if user is not authenticated', async () => {
//     const bidData = {
//       lot_id: queryLotId,
//       buyer_id: queryBuyerId,
//       bid_amount: 5000,
//       paddle_number: 1,
//       auction_id: auctionId,
//       bid_type: 'absentee',
//       seller_email: sellerEmail
//     };

//     const event = {
//       requestContext: {
//         authorizer: {}
//       },
//       body: JSON.stringify(bidData)
//     };

//     const response = await place_bid(event);
//     expect(response.statusCode).toBe(403);
    
//     const body = JSON.parse(response.body);
//     expect(body.message).toBe('You do not have access to perform this API action');
//   });

//   test('should return 404 if lot not found', async () => {
//     // First verify that valid data exists
//     const lots = db.collection(`${process.env.STAGE}-lots`);
//     const existingLot = await lots.findOne({ _id: new ObjectId(queryLotId) });
//     expect(existingLot).not.toBeNull();

//     const bidData = {
//       lot_id: new ObjectId().toString(), // Non-existent lot ID
//       buyer_id: queryBuyerId,
//       bid_amount: 5000,
//       paddle_number: 1,
//       auction_id: auctionId,
//       bid_type: 'manual',
//       seller_email: sellerEmail
//     };

//     const event = {
//       requestContext: {
//         authorizer: {
//           claims: {
//             'cognito:username': 'buyer@example.com'
//           }
//         }
//       },
//       body: JSON.stringify(bidData)
//     };

//     const response = await place_bid(event);
//     expect(response.statusCode).toBe(404);

//     const body = JSON.parse(response.body);
//     expect(body.message).toBe('Lot not found');
//   });

//   test('should return 404 if auction not found', async () => {
//     const bidData = {
//       lot_id: queryLotId,
//       buyer_id: queryBuyerId,
//       bid_amount: 5000,
//       paddle_number: 1,
//       auction_id: 'NON_EXISTENT_AUCTION',
//       bid_type: 'absentee',
//       seller_email: sellerEmail
//     };

//     const event = {
//       requestContext: {
//         authorizer: {
//           claims: {
//             'cognito:username': 'buyer@example.com'
//           }
//         }
//       },
//       body: JSON.stringify(bidData)
//     };

//     const response = await place_bid(event);
//     expect(response.statusCode).toBe(404);

//     const body = JSON.parse(response.body);
//     expect(body.message).toBe('Auction not found');
//   });

//   test('should return 404 if buyer not found', async () => {
//     const bidData = {
//       lot_id: queryLotId,
//       buyer_id: new ObjectId().toString(), // Non-existent buyer ID
//       bid_amount: 5000,
//       paddle_number: 1,
//       auction_id: auctionId,
//       bid_type: 'absentee',
//       seller_email: sellerEmail
//     };

//     const event = {
//       requestContext: {
//         authorizer: {
//           claims: {
//             'cognito:username': 'buyer@example.com'
//           }
//         }
//       },
//       body: JSON.stringify(bidData)
//     };

//     const response = await place_bid(event);
//     expect(response.statusCode).toBe(404);

//     const body = JSON.parse(response.body);
//     expect(body.message).toBe('Buyer not found');
//   });

//   test('should return 400 if auction is not published', async () => {
//     const bidData = {
//       lot_id: queryLotId,
//       buyer_id: queryBuyerId,
//       bid_amount: 5000,
//       paddle_number: 1,
//       auction_id: 'A-DRAFT', // This auction has Draft status
//       bid_type: 'absentee',
//       seller_email: sellerEmail
//     };

//     const event = {
//       requestContext: {
//         authorizer: {
//           claims: {
//             'cognito:username': 'buyer@example.com'
//           }
//         }
//       },
//       body: JSON.stringify(bidData)
//     };

//     const response = await place_bid(event);
//     expect(response.statusCode).toBe(400);

//     const body = JSON.parse(response.body);
//     expect(body.message).toBe('Cannot place bid on an auction that is not published');
//   });

//   test('should return 400 if buyer not registered for auction', async () => {
//     // Create a buyer that exists but is not registered for this specific auction
//     const buyers = db.collection(`${process.env.STAGE}-buyers`);
//     const unregisteredBuyerData = await buyers.insertOne({
//       buyer_id: 'UNREGISTERED_BUYER',
//       auction_id: 'DIFFERENT_AUCTION',
//       seller_email: sellerEmail,
//       name: 'Unregistered Buyer',
//       email_address: 'unregistered@example.com'
//     });

//     const bidData = {
//       lot_id: queryLotId,
//       buyer_id: unregisteredBuyerData.insertedId.toString(),
//       bid_amount: 5000,
//       paddle_number: 1,
//       auction_id: auctionId,
//       bid_type: 'absentee',
//       seller_email: sellerEmail
//     };

//     const event = {
//       requestContext: {
//         authorizer: {
//           claims: {
//             'cognito:username': 'buyer@example.com'
//           }
//         }
//       },
//       body: JSON.stringify(bidData)
//     };

//     const response = await place_bid(event);
//     expect(response.statusCode).toBe(400);

//     const body = JSON.parse(response.body);
//     expect(body.message).toBe('Buyer is not registered for this auction');
//   });

//   test('should return 400 if bid already placed', async () => {
//     // First, place a bid
//     const liveBids = db.collection(`${process.env.STAGE}-live-bids`);
//     await liveBids.insertOne({
//       lot_id: queryLotId,
//       buyer_id: queryBuyerId,
//       bid_amount: 3000,
//       auction_id: auctionId,
//       seller_email: sellerEmail,
//       created_at: new Date(),
//       timestamp: Math.floor(Date.now())
//     });

//     const bidData = {
//       lot_id: queryLotId,
//       buyer_id: queryBuyerId,
//       bid_amount: 5000,
//       paddle_number: 1,
//       auction_id: auctionId,
//       bid_type: 'absentee',
//       seller_email: sellerEmail
//     };

//     const event = {
//       requestContext: {
//         authorizer: {
//           claims: {
//             'cognito:username': 'buyer@example.com'
//           }
//         }
//       },
//       body: JSON.stringify(bidData)
//     };

//     const response = await place_bid(event);
//     expect(response.statusCode).toBe(400);

//     const body = JSON.parse(response.body);
//     expect(body.message).toBe('Bid already placed');
//   });

//   test('should return 400 for invalid request body', async () => {
//     const event = {
//       requestContext: {
//         authorizer: {
//           claims: {
//             'cognito:username': 'buyer@example.com'
//           }
//         }
//       },
//       body: null // Invalid body
//     };

//     const response = await place_bid(event);
//     expect(response.statusCode).toBe(400);

//     const body = JSON.parse(response.body);
//     expect(body.message).toBe('Invalid request body');
//   });
});
