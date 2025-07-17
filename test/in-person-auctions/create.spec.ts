import Module from 'module';
import path from 'path';

// --- MONKEY-PATCH TO FIX BROKEN REQUIRE PATHS ---
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function(request: string, parent: any, ...args: any[]) {
  const rootDir = path.resolve(__dirname, '../../');
  if (parent && parent.filename.includes('services/in-person-auctions/handlers/create.js')) {
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
loadEnvironmentVariables();

// // Set required environment variables for the test
// process.env.STAGE = "test";
// process.env.BID_COLLECTION_NAME = "test-unique-bids";

const { handler } = require('../../services/in-person-auctions/handlers/create.js');

// --- Test Suite ---
test.describe('In Person Auction Create handler tests', () => {
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

  test.describe('Create In Person Auction', () => {
    test('should create a new in person auction', async () => {
      const auctions = db.collection(process.env.AUCTION_COLLECTION_NAME!);

      // Clear all collections
      await auctions.deleteMany({});

      // Generate a fresh ObjectId and string version
      const auctionObjectId = new ObjectId();
      const auctionIdAsString = auctionObjectId.toHexString();

      // Prepare auction data with all required fields
      const auctionData = lotTestData.getData('baseAuction');
      auctionData._id = auctionObjectId;
      auctionData.current_bid = 300;
      auctionData.top_bidder = 'Katrina Stokes';
      auctionData.seller_email = 'test-seller@example.com';
      const event = LambdaEventFactory.createPostEvent(null, { ...auctionData }, null);
      const response = await handler(event);
      console.log('Response:', response);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data).toHaveProperty('id');
      expect(body.data.id).toBe(auctionIdAsString);
      expect(body.data.current_bid).toBe(300);
      expect(body.data.top_bidder).toBe('Katrina Stokes');
      expect(body.data.seller_email).toBe('test-seller@example.com');
    });
  })
});

