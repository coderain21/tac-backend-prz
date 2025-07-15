import Module from 'module';
import path from 'path';

// --- MONKEY-PATCH TO FIX BROKEN REQUIRE PATHS ---
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function(request: string, parent: any, ...args: any[]) {
  const rootDir = path.resolve(__dirname, '../../');
  if (parent && parent.filename.includes('services/lot-bid-history/handlers/list.js')) {
    if (request.startsWith('../lib/')) {
      const moduleName = request.substring('../lib/'.length);
      request = path.join(rootDir, 'lib', moduleName);
    } else if (request.startsWith('../entities/')) {
      const moduleName = request.substring('../entities/'.length);
      request = path.join(rootDir, 'entities', moduleName);
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};
// --- END OF PATCH ---

import { test, expect } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';
import { LambdaEventFactory } from '../lib/lambda_event_factory';
import { lotTestData, bidTestData } from '../lib/test_data_manager';

// --- Test Setup ---
loadEnvironmentVariables();
const { handler } = require('../../services/lot-bid-history/handlers/list.js');

// --- Test Suite ---
test.describe('Lot Bid History API', () => {
  let client: MongoClient;
  let db;

  test.beforeAll(async () => {
    if (!process.env.MONGO_CLIENT) {
      throw new Error('MONGO_CLIENT environment variable is not set. Please check test/.env');
    }
    client = new MongoClient(process.env.MONGO_CLIENT);
    await client.connect();
    db = client.db(process.env.DATABASE!);
  });

  test.afterAll(async () => {
    await client.close();
  });

  // --- Test Cases ---

  test('should return 200 OK and a list of bids for a valid lot ID', async () => {
    const lots = db.collection(process.env.LOT_COLLECTION_NAME!);
    const bidInformation = db.collection(process.env.BID_INFORMATION_COLLECTION_NAME!);
    
    // Check if BID_COLLECTION_NAME exists, otherwise use a default or skip
    let bids;
    if (process.env.BID_COLLECTION_NAME) {
      bids = db.collection(process.env.BID_COLLECTION_NAME);
    } else {
      // If no separate bid collection, use the same as bidInformation
      bids = bidInformation;
    }

    await lots.deleteMany({});
    await bidInformation.deleteMany({});
    if (bids !== bidInformation) {
      await bids.deleteMany({}); // Clear both collections only if they're different
    }

    // Generate a fresh ObjectId and string version
    const lotObjectId = new ObjectId();
    const lotIdAsString = lotObjectId.toHexString();

    // Insert test lot
    const lotData = lotTestData.getData('baseLot');
    lotData._id = lotObjectId;
    lotData.current_bid = 300;
    lotData.top_bidder = 'Katrina Stokes';
    lotData.seller_email = 'test-seller@example.com';
    await lots.insertOne(lotData);

    // Insert test bids into BidInformation collection (main query)
    const bidInfoData = [
      bidTestData.getData('highBid', {
        lot_id: lotIdAsString,
        name: 'Katrina Stokes',
        bid_amount: 300,
        paddle_number: 28,
        timestamp: Date.now(), // Schema uses timestamp, not time_stamp
      }),
      bidTestData.getData('lowBid', {
        lot_id: lotIdAsString,
        name: 'Beverly Kirlin I',
        bid_amount: 250,
        paddle_number: 87,
        timestamp: Date.now(),
      }),
    ];
    await bidInformation.insertMany(bidInfoData);

    // Insert test bids into Bid collection (for count query) - only if different from bidInformation
    if (bids !== bidInformation) {
      const bidData = [
        bidTestData.getData('highBid', {
          lot_id: lotIdAsString,
          name: 'Katrina Stokes',
          bid_amount: 300,
          paddle_number: 28,
          timestamp: Date.now(),
        }),
        bidTestData.getData('lowBid', {
          lot_id: lotIdAsString,
          name: 'Beverly Kirlin I',
          bid_amount: 250,
          paddle_number: 87,
          timestamp: Date.now(),
        }),
      ];
      await bids.insertMany(bidData);
    }

    // 🛠️ Wait briefly to ensure MongoDB write visibility
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify inserted data
    console.log('Inserted lot:', await lots.findOne({ _id: lotObjectId }));
    console.log('Inserted bid information:', await bidInformation.find({ lot_id: lotIdAsString }).toArray());
    if (bids !== bidInformation) {
      console.log('Inserted bids:', await bids.find({ lot_id: lotIdAsString }).toArray());
    }

    // Prepare event
    const event = LambdaEventFactory.createGetEvent(
      null,
      { lot_id: lotIdAsString, page: '1', limit: '10' },
      null
    );

    // Invoke handler
    const response = await handler(event);
    console.log('Response:', response);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.data).toHaveLength(2);
    expect(body.pagination.total_records).toBe(2);
    expect(body.pagination.top_bid).toBe(300);
    expect(body.pagination.top_bidder).toBe('Katrina Stokes');
  });

  test('should return 404 Not Found for a lot that does not exist', async () => {
    const nonExistentLotId = new ObjectId().toHexString();
    const event = LambdaEventFactory.createGetEvent(null, { lot_id: nonExistentLotId }, null);
    const response = await handler(event);
    console.log('Response 2:', response);
    expect(response.statusCode).toBe(404);
    expect(response.statusCode).toBe(404);
  });
});