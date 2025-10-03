import Module from 'module';
import path from 'path';
import { test, expect } from '@playwright/test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Monkey-patch require paths for handler
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
  const rootDir = path.resolve(__dirname, '../../');
  if (parent && parent.filename.includes('services/in-person-buyer/handlers/update_bid.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};

loadEnvironmentVariables('services/in-person-buyer/');

const { update_bid } = require('../../services/in-person-buyer/handlers/update_bid.js');

test.describe('Update Bid Tests', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME || 'test-user@example.com';
  const buyerEmail = 'buyer@example.com';
  const auctionId = `TEST-AUCTION-${Date.now()}`;
  const lotId = `TEST-LOT-${Date.now()}`;
  const buyerId = `TEST-BUYER-${Date.now()}`;
  
  let queryLotId: string;
  let queryBuyerId: string;
  let queryAuctionObjectId: ObjectId;
  let testBidId: string;

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_CLIENT || 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(process.env.DATABASE || 'indyauction-test');
  });

  test.afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  async function setupTestData() {
    const stage = process.env.STAGE || 'test';
    const users = db.collection(`${stage}-users`);
    const auctions = db.collection(`${stage}-auctions`);
    const lots = db.collection(`${stage}-lots`);
    const buyers = db.collection(`${stage}-buyers`);
    const registeredUsers = db.collection(`${stage}-register-auction`);
    const liveBids = db.collection(`${stage}-live-bids`);

    // Clean up test data
    await registeredUsers.deleteMany({ email_address: buyerEmail });
    await liveBids.deleteMany({ seller_email: sellerEmail });
    await buyers.deleteMany({ buyer_id: { $regex: '^TEST-BUYER-' } });
    await lots.deleteMany({ lot_id: { $regex: '^TEST-LOT-' } });
    await auctions.deleteMany({ auction_id: { $regex: '^TEST-AUCTION-' } });
    await users.deleteMany({ seller_id: 'S-API' });
    await delay(350);

    const insertOptions = { writeConcern: { w: 'majority', j: true } };

    // User
    await users.insertOne({
      email_address: sellerEmail,
      first_name: 'Api',
      last_name: 'User',
      seller_id: 'S-API'
    }, insertOptions);

    // Auction (set to start in future to allow bid editing)
    const futureStartDate = Math.floor((Date.now() + (2 * 60 * 60 * 1000)));
    const auctionData = await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Published',
      start_date: futureStartDate,
      accept_absentee_bid: true,
      accept_telephone_bid: true,
      auction_type: 'live',
      menu_links: [],
      auction_image: '',
      faq: [],
      fees: '',
      total_lots: 0
    }, insertOptions);
    queryAuctionObjectId = auctionData.insertedId;

    // Lot
    const lotData = await lots.insertOne({
      lot_id: lotId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      title: 'Test Lot',
      tags: [],
      images: []
    }, insertOptions);
    queryLotId = lotData.insertedId.toString();

    // Buyer
    const buyerData = await buyers.insertOne({
      buyer_id: buyerId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      name: 'Test Buyer',
      email_address: buyerEmail,
      newsletter_notification: false,
      terms_and_condition: false,
      first_name: 'Test',
      last_name: 'Buyer',
      registered_through: 'website'
    }, insertOptions);
    queryBuyerId = buyerData.insertedId.toString();

    // Registration
    await registeredUsers.insertOne({
      auction_id: queryAuctionObjectId,
      email_address: buyerEmail,
      seller_email: sellerEmail,
      created_at: new Date(),
      updated_at: new Date(),
      first_name: 'Test',
      last_name: 'Buyer',
      status: 'active'
    }, insertOptions);

    // Create a test bid
    const bidData = await liveBids.insertOne({
      lot_id: queryLotId,
      buyer_id: queryBuyerId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      email_address: buyerEmail,
      bid_amount: 1000,
      bid_type: 'absentee',
      paddle_number: 1,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    }, insertOptions);
    testBidId = bidData.insertedId.toString();

    await delay(350);
    return { queryLotId, queryBuyerId, auctionId, sellerEmail, testBidId };
  }

  // Positive Test Cases
//   test('should successfully update absentee bid amount', async () => {
//     const { testBidId } = await setupTestData();

//     const updateData = {
//       bid_amount: 2000
//     };

//     const event = {
//       requestContext: {
//         authorizer: {
//           claims: { 'cognito:username': buyerEmail }
//         }
//       },
//       pathParameters: { bid_id: testBidId },
//       body: JSON.stringify(updateData)
//     };

//     const response = await update_bid(event);
//     expect(response.statusCode).toBe(204);

//     // Verify the bid was updated in the database
//     const stage = process.env.STAGE || 'test';
//     const liveBids = db.collection(`${stage}-live-bids`);
//     const updatedBid = await liveBids.findOne({ _id: new ObjectId(testBidId) });
//     expect(updatedBid?.bid_amount).toBe(2000);
//   });

//   test('should successfully update telephone bid with all required fields', async () => {
//     // Create a telephone bid first
//     const stage = process.env.STAGE || 'test';
//     const liveBids = db.collection(`${stage}-live-bids`);
    
//     await setupTestData();
    
//     const telephoneBidData = await liveBids.insertOne({
//       lot_id: queryLotId,
//       buyer_id: queryBuyerId,
//       auction_id: auctionId,
//       seller_email: sellerEmail,
//       email_address: buyerEmail,
//       bid_amount: 1500,
//       bid_type: 'telephone',
//       paddle_number: 1,
//       phone_number: '+1234567890',
//       country_code: '+1',
//       created_at: Math.floor(Date.now() / 1000),
//       updated_at: Math.floor(Date.now() / 1000)
//     });
//     const telephoneBidId = telephoneBidData.insertedId.toString();

//     const updateData = {
//       bid_amount: 3000,
//       phone_number: '+9876543210',
//       country_code: '+44'
//     };

//     const event = {
//       requestContext: {
//         authorizer: {
//           claims: { 'cognito:username': buyerEmail }
//         }
//       },
//       pathParameters: { bid_id: telephoneBidId },
//       body: JSON.stringify(updateData)
//     };

//     const response = await update_bid(event);
//     expect(response.statusCode).toBe(204);

//     // Verify the bid was updated
//     const updatedBid = await liveBids.findOne({ _id: new ObjectId(telephoneBidId) });
//     expect(updatedBid?.bid_amount).toBe(3000);
//     expect(updatedBid?.phone_number).toBe('+9876543210');
//     expect(updatedBid?.country_code).toBe('+44');
//   });

  // Negative Test Cases - Authorization
  test('should return 403 when no authorization claims provided', async () => {
    await setupTestData();

    const event = {
      requestContext: {},
      pathParameters: { bid_id: testBidId },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to perform this API action');
  });

  test('should return 403 when user tries to update another users bid', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': 'different-user@example.com' }
        }
      },
      pathParameters: { bid_id: testBidId },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to modify this bid');
  });

  // Negative Test Cases - Validation
  test('should return 400 when bid_id is missing', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: {},
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Bid ID is required');
  });

  test('should return 400 when bid_id format is invalid', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: 'invalid-object-id' },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Invalid bid ID format');
  });

  test('should return 404 when bid not found', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: new ObjectId().toString() },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Bid not found');
  });

  test('should return 400 when auction has already started', async () => {
    // Create auction that has already started
    const stage = process.env.STAGE || 'test';
    const auctions = db.collection(`${stage}-auctions`);
    const liveBids = db.collection(`${stage}-live-bids`);
    
    const pastStartDate = Math.floor((Date.now() - (1 * 60 * 60 * 1000))); // 1 hour ago
    const pastAuctionId = `PAST-AUCTION-${Date.now()}`;
    
    await auctions.insertOne({
      auction_id: pastAuctionId,
      seller_email: sellerEmail,
      status: 'Published',
      start_date: pastStartDate,
      accept_absentee_bid: true,
      accept_telephone_bid: true
    });

    const pastBidData = await liveBids.insertOne({
      lot_id: queryLotId,
      buyer_id: queryBuyerId,
      auction_id: pastAuctionId,
      seller_email: sellerEmail,
      email_address: buyerEmail,
      bid_amount: 1000,
      bid_type: 'absentee',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: pastBidData.insertedId.toString() },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Cannot edit bid after auction has started');
  });

  test('should return 400 when auction does not accept bid type', async () => {
    // Create auction that doesn't accept absentee bids
    const stage = process.env.STAGE || 'test';
    const auctions = db.collection(`${stage}-auctions`);
    const liveBids = db.collection(`${stage}-live-bids`);
    
    const futureStartDate = Math.floor((Date.now() + (2 * 60 * 60 * 1000)));
    const restrictedAuctionId = `RESTRICTED-AUCTION-${Date.now()}`;
    
    await auctions.insertOne({
      auction_id: restrictedAuctionId,
      seller_email: sellerEmail,
      status: 'Published',
      start_date: futureStartDate,
      accept_absentee_bid: false, // Not accepting absentee bids
      accept_telephone_bid: true
    });

    const restrictedBidData = await liveBids.insertOne({
      lot_id: queryLotId,
      buyer_id: queryBuyerId,
      auction_id: restrictedAuctionId,
      seller_email: sellerEmail,
      email_address: buyerEmail,
      bid_amount: 1000,
      bid_type: 'absentee',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: restrictedBidData.insertedId.toString() },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('This auction is not accepting absentee bids');
  });

  test('should return 400 when required fields missing for telephone bid', async () => {
    // Create a telephone bid first
    const stage = process.env.STAGE || 'test';
    const liveBids = db.collection(`${stage}-live-bids`);
    
    await setupTestData();
    
    const telephoneBidData = await liveBids.insertOne({
      lot_id: queryLotId,
      buyer_id: queryBuyerId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      email_address: buyerEmail,
      bid_amount: 1500,
      bid_type: 'telephone',
      phone_number: '+1234567890',
      country_code: '+1',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: telephoneBidData.insertedId.toString() },
      body: JSON.stringify({ bid_amount: 2000 }) // Missing phone_number and country_code
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Phone number, country code and bid amount are required for telephone bids');
  });

  test('should return 400 when bid_amount missing for absentee bid', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: testBidId },
      body: JSON.stringify({}) // Missing bid_amount
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Bid amount is required for absentee bids');
  });

  test('should return 404 when auction not found', async () => {
    // Create bid with non-existent auction
    const stage = process.env.STAGE || 'test';
    const liveBids = db.collection(`${stage}-live-bids`);
    
    await setupTestData();
    
    const orphanBidData = await liveBids.insertOne({
      lot_id: queryLotId,
      buyer_id: queryBuyerId,
      auction_id: 'NON-EXISTENT-AUCTION',
      seller_email: sellerEmail,
      email_address: buyerEmail,
      bid_amount: 1000,
      bid_type: 'absentee',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: orphanBidData.insertedId.toString() },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Auction not found');
  });

  test('should return 404 when lot not found', async () => {
    // Create bid with non-existent lot
    const stage = process.env.STAGE || 'test';
    const liveBids = db.collection(`${stage}-live-bids`);
    
    await setupTestData();
    
    const orphanLotBidData = await liveBids.insertOne({
      lot_id: new ObjectId().toString(), // Non-existent lot
      buyer_id: queryBuyerId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      email_address: buyerEmail,
      bid_amount: 1000,
      bid_type: 'absentee',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: orphanLotBidData.insertedId.toString() },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Lot not found');
  });

  test('should return 404 when buyer not found', async () => {
    // Create bid with non-existent buyer
    const stage = process.env.STAGE || 'test';
    const liveBids = db.collection(`${stage}-live-bids`);
    
    await setupTestData();
    
    const orphanBuyerBidData = await liveBids.insertOne({
      lot_id: queryLotId,
      buyer_id: new ObjectId().toString(), // Non-existent buyer
      auction_id: auctionId,
      seller_email: sellerEmail,
      email_address: buyerEmail,
      bid_amount: 1000,
      bid_type: 'absentee',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: orphanBuyerBidData.insertedId.toString() },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Buyer not found');
  });

  // Edge case: Invalid bid type
  test('should return 400 for invalid bid type', async () => {
    const stage = process.env.STAGE || 'test';
    const liveBids = db.collection(`${stage}-live-bids`);
    
    await setupTestData();
    
    const invalidBidData = await liveBids.insertOne({
      lot_id: queryLotId,
      buyer_id: queryBuyerId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      email_address: buyerEmail,
      bid_amount: 1000,
      bid_type: 'invalid_type', // Invalid bid type
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': buyerEmail }
        }
      },
      pathParameters: { bid_id: invalidBidData.insertedId.toString() },
      body: JSON.stringify({ bid_amount: 2000 })
    };

    const response = await update_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('This auction is not accepting invalid_type bids');
  });
});