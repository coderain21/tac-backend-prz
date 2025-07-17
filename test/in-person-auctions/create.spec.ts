import Module from 'module';
import path from 'path';
import { execSync } from 'child_process';

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
import { auctionTestData } from '../lib/test_data_manager';

// --- Test Setup ---
loadEnvironmentVariables('services/in-person-auctions/handlers/create.js');

const { create_auction } = require('../../services/in-person-auctions/handlers/create.js');

// --- Test Suite ---
test.describe('In Person Auction Create handler tests', () => {
  let client: MongoClient;
  let db: Db;
  const sellerEmail = process.env.API_USERNAME!;

  test.beforeEach(async () => {
    if (!process.env.MONGO_CLIENT) {
      throw new Error('MONGO_CLIENT environment variable is not set. Please check test/.env');
    }
    client = new MongoClient(process.env.MONGO_CLIENT);
    await client.connect();
    db = client.db(process.env.DATABASE!);

    // Clean up all relevant collections before each test
    const users = db.collection(process.env.SELLERS_TABLE!);
    const auctions = db.collection(process.env.AUCTION_COLLECTION_NAME!);
    await users.deleteMany({});
    await auctions.deleteMany({});

    // Insert the test user
    await users.insertOne({
      email_address: sellerEmail,
      first_name: 'Api',
      last_name: 'User',
      seller_id: 'S-API'
    });
  });

  test.afterEach(async () => {
    await client.close();
  });

  // --- Test Cases ---
  test('should create a new in person auction with a valid user', async () => {
    const auctionData = auctionTestData.getData('Classic');

    const event = LambdaEventFactory.createPostEvent(
      { 'cognito:username': sellerEmail },
      auctionData,
      null
    );

    const response = await create_auction(event);
    
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);

    expect(body).toHaveProperty('_id');
    const newAuction = await db.collection(process.env.AUCTION_COLLECTION_NAME!).findOne({ _id: new ObjectId(body._id) });
    expect(newAuction).not.toBeNull();
    expect(newAuction.seller_email).toBe(sellerEmail);
  });

  test('should return 403 Forbidden if the user is not authenticated', async () => {
    const auctionData = auctionTestData.getData('Classic');
    const event = LambdaEventFactory.createPostEvent(null, auctionData, null);
    const response = await create_auction(event);
    expect(response.statusCode).toBe(403);
  });

  test('should return 400 Bad Request if the payload is invalid', async () => {
    const auctionData = auctionTestData.getData('Classic');
    auctionData.currency = 111;

    const event = LambdaEventFactory.createPostEvent(
      { 'cognito:username': sellerEmail },
      auctionData,
      null
    );

    const response = await create_auction(event);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toContain('Validation error: \"currency\" must be a string');
  });

});
