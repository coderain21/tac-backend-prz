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
import { Db, MongoClient, ObjectId } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';
import { LambdaEventFactory } from '../lib/lambda_event_factory';
import { lotTestData, bidTestData } from '../lib/test_data_manager';

// --- Test Setup ---
loadEnvironmentVariables('services/lot-bid-history');

// // Set required environment variables for the test
// process.env.STAGE = "test";
// process.env.BID_COLLECTION_NAME = "test-unique-bids";

const { handler } = require('../../services/lot-bid-history/handlers/list.js');


// process.env.MONGO_CLIENT = 'mongodb://testAdmin:testPassword@localhost:27017';

// --- Test Suite ---
test.describe('Lot Bid History API', () => {
  let client: MongoClient;
  let db: Db;

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
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const bidInformation = db.collection(`${process.env.STAGE}-bid-informations`);
    const uniqueBids = db.collection(`${process.env.STAGE}-unique-bids`);

    // Clear all collections
    await lots.deleteMany({});
    await bidInformation.deleteMany({});
    await uniqueBids.deleteMany({});

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

    // Prepare bid data with all required fields
    const bidInfoData = [
      {
        ...bidTestData.getData('highBid', {
          lot_id: lotIdAsString,
          name: 'Katrina Stokes',
          bid_amount: 300,
          paddle_number: 28,
        }),
        timestamp: Date.now(),
        auction_id: 'test-auction-123',
        seller_email: 'test-seller@example.com',
        buyer_id: 'buyer-123',
        email_address: 'katrina@example.com',
        created_at: new Date(),
        updated_at: new Date(),
        location: 'New York',
      },
      {
        ...bidTestData.getData('lowBid', {
          lot_id: lotIdAsString,
          name: 'Beverly Kirlin I',
          bid_amount: 250,
          paddle_number: 87,
        }),
        timestamp: Date.now(),
        auction_id: 'test-auction-123',
        seller_email: 'test-seller@example.com',
        buyer_id: 'buyer-456',
        email_address: 'beverly@example.com',
        created_at: new Date(),
        updated_at: new Date(),
        location: 'California',
      },
    ];

    // Insert into BidInformation collection (main query)
    await bidInformation.insertMany(bidInfoData);

    // Insert into unique-bids collection (for count query)
    await uniqueBids.insertMany(bidInfoData);

    // 🛠️ Wait briefly to ensure MongoDB write visibility
    await new Promise(resolve => setTimeout(resolve, 100));

    // Debug logs
    console.log('STAGE:', process.env.STAGE);
    console.log('Expected BidInformation collection:', `${process.env.STAGE}-bid-informations`);
    console.log('Expected Bid collection:', `${process.env.STAGE}-unique-bids`);
    console.log('Inserted lot:', await lots.findOne({ _id: lotObjectId }));
    console.log('Inserted bid information:', await bidInformation.find({ lot_id: lotIdAsString }).toArray());
    console.log('Inserted unique bids:', await uniqueBids.find({ lot_id: lotIdAsString }).toArray());

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
  });
});