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
  if (parent && parent.filename.includes('services/in-person-auction/handlers/publish_auction.js')) {
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
const { publish_auction } = require('../../services/in-person-auction/handlers/publish_auction.js');

test.describe('In Person Auction Publish handler tests', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = 'test@example.com';
  const auctionId = 'A-CLASSIC-TEST';

  test.beforeAll(async () => {
      client = new MongoClient(process.env.MONGO_CLIENT || 'mongodb://localhost:27017');
      await client.connect();
      db = client.db(process.env.DATABASE || 'indyauction-test');
  });

  test.afterAll(async () => {
    await closeDatabaseConnection();
  });

  test.beforeEach(async () => {
    const stage = process.env.STAGE || 'test';
    const auctions = db.collection(`${stage}-auctions`);
    const users = db.collection(`${stage}-users`);
    const lots = db.collection(`${stage}-lots`);
    
    await auctions.deleteMany({});
    await users.deleteMany({});
    await lots.deleteMany({});
    
    // Create test user data
    await users.insertOne({
      email_address: sellerEmail,
      status: 'Active',
      stripe_status: 'connected',
      paypal_status: 'connected',
      created_at: new Date(),
      updated_at: new Date()
    });
  });

  test('should update an existing in person auction with a valid user', async () => {
    // First, create an auction to update
    const auctions = db.collection(`${process.env.STAGE || 'test'}-auctions`);
    const existingAuction = {
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Draft', // Must be Draft to allow updates
      title: 'Original Title',
      description: 'Original Description',
      auction_image: 'https://example.com/image.jpg',
      currency: 'USD',
      time_zone: 'America/New_York',
      registration_type: 'Email only',
      start_date: Date.now() + 86400000, // 24 hours from now
      // Add other required fields based on your auction schema
    };
    
    await auctions.insertOne(existingAuction);

    // Create lots with images for the auction
    const stage = process.env.STAGE || 'test';
    const lots = db.collection(`${stage}-lots`);
    await lots.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      lot_number: 1,
      title: 'Test Lot',
      images: [
        {
          url: 'https://example.com/lot-image.jpg',
          featured: true
        }
      ],
      created_at: new Date(),
      updated_at: new Date()
    });

    // Prepare update data (only updatable fields for Draft status)
    const updateData = {
      auction_id: auctionId,
      seller_email: sellerEmail,
    };

    const event = LambdaEventFactory.createPatchEvent(
      { 'cognito:username': sellerEmail }, // claims
      updateData, // body
      { auction_id: auctionId } // pathParameters 
    );

    const response = await publish_auction(event);
    expect(response.statusCode).toBe(204);

    // Verify the auction was actually updated
    const updatedAuction = await auctions.findOne({ auction_id: auctionId, seller_email: sellerEmail });
    expect(updatedAuction).toBeTruthy();
    expect(updatedAuction.status).toBe('Published');
  });

  test('should return 403 Forbidden if the user is not authenticated', async () => {
    const updateData = { seller_email: sellerEmail, auction_id: auctionId };
    
    // Pass null claims to simulate unauthenticated user
    const event = LambdaEventFactory.createPatchEvent(
      null, // claims = null
      updateData,
      { auction_id: auctionId }
    );

    const response = await publish_auction(event);
    expect(response.statusCode).toBe(403);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('You do not have access to perform this API action');
  });

  test('should return 404 if auction not found', async () => {
    const updateData = { auction_id: 'NON-EXISTENT-ID', seller_email: sellerEmail };
    
    const event = LambdaEventFactory.createPatchEvent(
      { 'cognito:username': sellerEmail },
      updateData,
      { auction_id: 'NON-EXISTENT-ID' }
    );

    const response = await publish_auction(event);
    expect(response.statusCode).toBe(404);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Auction not found');
  });

  test('should return 400 if trying to update restricted fields for published auction', async () => {
    // First, create a published auction
    const auctions = db.collection(`${process.env.STAGE || 'test'}-auctions`);
    const publishedAuction = {
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Published', // Published status
      currency: 'USD',
      title: 'Original Title'
    };
    
    await auctions.insertOne(publishedAuction);

    // Try to update a restricted field
    const updateData = {
      seller_email: 'wrong@example.com',
      auction_id: auctionId
    };

    const event = LambdaEventFactory.createPatchEvent(
      { 'cognito:username': sellerEmail },
      updateData,
      { auction_id: auctionId }
    );

    const response = await publish_auction(event);
    expect(response.statusCode).toBe(403);

    const body = JSON.parse(response.body);
    expect(body.message).toContain(`You do not have access to perform this API action`);
  });

});