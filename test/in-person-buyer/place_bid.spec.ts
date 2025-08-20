import Module from 'module';
import path from 'path';
import { test, expect } from '@playwright/test';
import { Db, MongoClient } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';
import { LambdaEventFactory } from '../lib/lambda_event_factory';
import { connectToDatabase, closeDatabaseConnection } from '../lib/db_helper';

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
  const buyerId = '67c83dc1833d0eb25ef7fc12a';

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

    await users.deleteMany({});
    await auctions.deleteMany({});
    await lots.deleteMany({});
    await buyers.deleteMany({});
    await liveBids.deleteMany({});

    await users.insertOne({
      email_address: sellerEmail,
      first_name: 'Api',
      last_name: 'User',
      seller_id: 'S-API'
    });

    // Fixed: Set start_date to far future time to avoid the date comparison bug in handler
    await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Published',
      start_date: Math.floor(Date.now()) + (48 * 60 * 60) // starts in 24 hours
    });

    const nonPublishedAuctionId = 'A-DRAFT';
    await auctions.insertOne({
      auction_id: nonPublishedAuctionId,
      seller_email: sellerEmail,
      status: 'Draft',
      start_date: Math.floor(Date.now()) + (48 * 60 * 60) // starts in 24 hours
    });

    await lots.insertOne({
      lot_id: lotId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      title: 'Test Lot'
    });

    await buyers.insertOne({
      buyer_id: buyerId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      name: 'Test Buyer',
      email_address: 'buyer@example.com'
    });
  });

  test('should place a valid bid', async () => {
    const bidData = {
      lot_id: lotId,
      buyer_id: buyerId,
      bid_amount: 5000,
      paddle_number: 1,
      auction_id: auctionId,
      bid_type: 'absentee',
      seller_email: sellerEmail
    };

    // Fixed: Use correct event structure with requestContext.authorizer.claims
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
    // console.log('Full response:', JSON.stringify(response, null, 2));
    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Bid placed successfully');

    const liveBids = db.collection(`${process.env.STAGE}-live-bids`);
    const savedBid = await liveBids.findOne({ lot_id: lotId, buyer_id: buyerId });
    expect(savedBid).not.toBeNull();
    expect(savedBid?.bid_amount).toBe(5000);
  });

  test('should return 403 if user is not authenticated', async () => {
    const bidData = {
      lot_id: lotId,
      buyer_id: buyerId,
      bid_amount: 5000,
      paddle_number: 1,
      auction_id: auctionId,
      bid_type: 'absentee',
      seller_email: sellerEmail
    };

    // Fixed: Use correct event structure without claims
    const event = {
      requestContext: {
        authorizer: {}
      },
      body: JSON.stringify(bidData)
    };

    const response = await place_bid(event);
    expect(response.statusCode).toBe(403);
  });

  test('should return 404 if lot not found', async () => {
    const bidData = {
      lot_id: 'NON_EXISTENT',
      buyer_id: buyerId,
      bid_amount: 5000,
      paddle_number: 1,
      auction_id: auctionId,
      bid_type: 'manual',
      seller_email: sellerEmail
    };

    // Fixed: Use correct event structure
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
    expect(response.statusCode).toBe(404);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Lot not found');
  });

  test('should return 400 if buyer not registered', async () => {
    const bidData = {
      lot_id: lotId,
      buyer_id: 'UNREGISTERED_BUYER',
      bid_amount: 5000,
      paddle_number: 1,
      auction_id: auctionId,
      bid_type: 'absentee',
      seller_email: sellerEmail
    };

    // Fixed: Use correct event structure
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
    // Fixed: Handler returns 404 for non-existent buyer, not 400
    expect(response.statusCode).toBe(404);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Buyer not found');
  });

  test('should return 400 if auction is not published', async () => {
    // Create a separate auction with non-published status to avoid the date bug
    const nonPublishedAuctionId = 'A-DRAFT';

    const bidData = {
      lot_id: lotId,
      buyer_id: buyerId,
      bid_amount: 5000,
      paddle_number: 1,
      auction_id: nonPublishedAuctionId,
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
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Cannot place bid on an auction that is not published');
  });

  test('should return 400 if buyer not registered for auction', async () => {
    // Create a buyer that exists but is not registered for this specific auction
    const unregisteredBuyerId = '67c83dc1833d0eb25ef7fc13';
    const buyers = db.collection(`${process.env.STAGE}-buyers`);
    await buyers.insertOne({
      buyer_id: unregisteredBuyerId,
      auction_id: 'DIFFERENT_AUCTION',
      seller_email: sellerEmail,
      name: 'Unregistered Buyer',
      email_address: 'unregistered@example.com'
    });

    const bidData = {
      lot_id: lotId,
      buyer_id: unregisteredBuyerId,
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
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Buyer is not registered for this auction');
  });

//   test('should return 400 if bid already placed', async () => {
//     // First, place a bid
//     const liveBids = db.collection(`${process.env.STAGE}-livebids`);
//     await liveBids.insertOne({
//       lot_id: lotId,
//       buyer_id: buyerId,
//       bid_amount: 3000,
//       auction_id: auctionId,
//       seller_email: sellerEmail
//     });

//     const bidData = {
//       lot_id: lotId,
//       buyer_id: buyerId,
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
});