import Module from 'module';
import path from 'path';
import { test, expect } from '@playwright/test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';
import { LambdaEventFactory } from '../lib/lambda_event_factory';
import { auctionTestData } from '../lib/test_data_manager';
import { connectToDatabase, closeDatabaseConnection, getDb } from '../lib/db_helper';

// --- MONKEY-PATCH TO FIX BROKEN REQUIRE PATHS ---
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
  const rootDir = path.resolve(__dirname, '../../');
  if (parent && parent.filename.includes('services/in-person-auction/handlers/create.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};
// --- END OF PATCH ---

loadEnvironmentVariables('services/in-person-auction/');

// Importing using require due to handler export style
const { create_auction } = require('../../services/in-person-auction/handlers/create.js');

test.describe('In Person Auction Create handler tests', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME || 'test-user@example.com';

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

//   if (!process.env.STAGE) {
//   process.env.STAGE = 'test'; // or 'dev' or whatever default you prefer
// }

  test.beforeEach(async () => {
    const stage = process.env.STAGE || 'test';
    const users = db.collection(`${stage}-users`);
    const auctions = db.collection(`${stage}-auctions`);
    await users.deleteMany({});
    await auctions.deleteMany({});

    await users.insertOne({
      email_address: sellerEmail,
      first_name: 'Api',
      last_name: 'User',
      seller_id: 'S-API'
    });
  });


  test('should create a new in person auction with a valid user', async () => {
        const auctionData = auctionTestData.getData('Classic');
        const event = LambdaEventFactory.createPostEvent(
          { 'cognito:username': sellerEmail },
          auctionData,
          null
        );

        // Record the time before creation
        const beforeCreation = new Date();

        const response = await create_auction(event);
        expect(response.statusCode).toBe(201);

        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('_id');

        const stage = process.env.STAGE || 'test';
        const auctionsCollection = db.collection(`${stage}-auctions`);
        
        // Find auction by seller_email that was created after our timestamp
        const newAuction = await auctionsCollection.findOne({ 
          seller_email: sellerEmail,
          created_at: { $gte: beforeCreation } // Adjust field name as needed
        });

        expect(newAuction).not.toBeNull();
        expect(newAuction?.seller_email).toBe(sellerEmail);
      });

  test('should return 403 Forbidden if the user is not authenticated', async () => {
    const auctionData = auctionTestData.getData('Classic');
    const event = LambdaEventFactory.createPostEvent(null, auctionData, null);

    const response = await create_auction(event);
    expect(response.statusCode).toBe(403);
  });

  // test('should return 400 Bad Request if the payload is invalid', async () => {
  //   const auctionData = auctionTestData.getData('Classic');
  //   auctionData.currency = 111; // Invalid data (should be string)

  //   const event = LambdaEventFactory.createPostEvent(
  //     { 'cognito:username': sellerEmail },
  //     auctionData,
  //     null
  //   );

  //   const response = await create_auction(event);
  //   expect(response.statusCode).toBe(400);

  //   const body = JSON.parse(response.body);
  //   expect(body.message).toContain('Validation error');
  // });
});
