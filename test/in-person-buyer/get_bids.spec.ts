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
  if (parent && parent.filename.includes('services/in-person-buyer/handlers/get_bids.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};

loadEnvironmentVariables('services/in-person-buyer/');

const { get_bids } = require('../../services/in-person-buyer/handlers/get_bids.js');

test.describe('Get Bids - Basic Functionality', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME || 'test-user@example.com';
  
  let queryAuctionObjectId: ObjectId;

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_CLIENT || 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(process.env.DATABASE || 'indyauction-test');
  });

  test.beforeEach(async () => {
    const stage = process.env.STAGE || 'test';
    const auctions = db.collection(`${stage}-auctions`);
    const liveBids = db.collection(`${stage}-live-bids`);
    
    // Clean up all test data more aggressively
    await liveBids.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^(CANCEL|TEST|DELETE|COMPLETED|GET-BIDS-TEST)-/ }
    });
    await auctions.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^(CANCEL|TEST|DELETE|COMPLETED|GET-BIDS-TEST)-/ }
    });
    await delay(1000); // Give more time for cleanup
  });

  test.afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  async function setupTestData() {
    const stage = process.env.STAGE || 'test';
    const auctions = db.collection(`${stage}-auctions`);
    const liveBids = db.collection(`${stage}-live-bids`);

    // Generate a unique auction_id for business logic
    const auctionId = `GET-BIDS-TEST-${Date.now()}-${Math.random()}`;

    // Clean up test data more specifically
    await liveBids.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^GET-BIDS-TEST-/ }
    });
    await auctions.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^GET-BIDS-TEST-/ }
    });
    await delay(500); // Longer delay for cleanup

    const insertOptions = { writeConcern: { w: 'majority', j: true } };

    // Create auction with proper structure
    const auctionInsertResult = await auctions.insertOne({
      auction_id: auctionId,  // Business identifier
      seller_email: sellerEmail,
      status: 'Published',
      auction_type: 'live',
      start_date: Date.now() + (2 * 60 * 60 * 1000),
      accept_absentee_bid: true,
      accept_telephone_bid: true
    }, insertOptions);
    
    queryAuctionObjectId = auctionInsertResult.insertedId;

    // Verify auction was inserted by querying it back
    const verifyAuction = await auctions.findOne({ _id: queryAuctionObjectId });
    
    if (!verifyAuction) {
      throw new Error('Failed to insert auction for test');
    }

    // Generate proper ObjectId strings for buyer and lots
    const buyerId = new ObjectId().toString();
    const lotId1 = new ObjectId().toString();
    const lotId2 = new ObjectId().toString();

    // Create test bids
    await liveBids.insertOne({
      auction_id: auctionId,  // Use the business auction_id
      seller_email: sellerEmail,
      buyer_id: buyerId,
      lot_id: lotId1,
      bid_amount: 3000,
      paddle_number: 1,
      bid_type: 'absentee',
      timestamp: Date.now(),
      created_at: new Date(),
      updated_at: Date.now()
    }, insertOptions);

    await liveBids.insertOne({
      auction_id: auctionId,  
      seller_email: sellerEmail,
      buyer_id: buyerId,
      lot_id: lotId2,
      bid_amount: 2500,
      paddle_number: 1,
      bid_type: 'live',
      timestamp: Date.now(),
      created_at: new Date(),
      updated_at: Date.now()
    }, insertOptions);

    await delay(500); // Ensure data is committed

    return { queryAuctionObjectId, buyerId, lotId1, auctionId, sellerEmail };
  }

  test('should return 200 and list of bids for buyer', async () => {
    const { queryAuctionObjectId, buyerId } = await setupTestData();

    const event = {
      pathParameters: {
        auction_id: queryAuctionObjectId.toString()  // Pass MongoDB _id
      },
      queryStringParameters: {
        buyer_id: buyerId
      }
    };

    const response = await get_bids(event);
    
    // Debug output if test fails
    if (response.statusCode !== 200) {
      console.log('Error response:', JSON.parse(response.body));
    }
    
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('bids');
    expect(Array.isArray(body.bids)).toBe(true);
    expect(body.bids.length).toBe(2);

    const firstBid = body.bids[0];
    expect(firstBid).toHaveProperty('lot_id');
    expect(firstBid).toHaveProperty('bid_amount');
    expect(firstBid).toHaveProperty('buyer_id');
    expect(firstBid).toHaveProperty('bid_type');
    expect(firstBid).toHaveProperty('_id');
  });

  test('should return 200 and filtered bids for specific lot', async () => {
    const { queryAuctionObjectId, buyerId, lotId1 } = await setupTestData();

    const event = {
      pathParameters: {
        auction_id: queryAuctionObjectId.toString()
      },
      queryStringParameters: {
        buyer_id: buyerId,
        lot_id: lotId1
      }
    };

    const response = await get_bids(event);
    
    // Debug output if test fails
    if (response.statusCode !== 200) {
      console.log('Error response:', JSON.parse(response.body));
    }
    
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('bids');
    expect(Array.isArray(body.bids)).toBe(true);
    expect(body.bids.length).toBe(1);

    const bid = body.bids[0];
    expect(bid.lot_id).toBe(lotId1);
    expect(bid.buyer_id).toBe(buyerId);
    expect(bid.bid_amount).toBe(3000);
    expect(bid.bid_type).toBe('absentee');
  });

  test('should return 400 when auction_id is missing', async () => {
    const event = {
      pathParameters: {},
      queryStringParameters: {
        buyer_id: new ObjectId().toString()
      }
    };

    const response = await get_bids(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Please provide auction_id');
  });

  test('should return 400 when buyer_id is missing', async () => {
    const { queryAuctionObjectId } = await setupTestData();

    const event = {
      pathParameters: {
        auction_id: queryAuctionObjectId.toString()
      },
      queryStringParameters: {}
    };

    const response = await get_bids(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Please provide buyer_id');
  });

  test('should return 404 when auction not found', async () => {
    const nonExistentAuctionId = new ObjectId().toString();

    const event = {
      pathParameters: {
        auction_id: nonExistentAuctionId
      },
      queryStringParameters: {
        buyer_id: new ObjectId().toString()
      }
    };

    const response = await get_bids(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Auction not found');
  });

});
