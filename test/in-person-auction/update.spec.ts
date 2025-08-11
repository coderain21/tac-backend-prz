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
  if (parent && parent.filename.includes('services/in-person-auction/handlers/update.js')) {
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
const { update_auction } = require('../../services/in-person-auction/handlers/update.js');

test.describe('In Person Auction Update handler tests', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = 'test@example.com';
  const auctionId = 'A-CLASSIC-TEST';

  test.beforeAll(async () => {
      client = new MongoClient(process.env.MONGO_CLIENT!);
      await client.connect();
      db = client.db(process.env.DATABASE);
  });

  test.afterAll(async () => {
    await closeDatabaseConnection();
  });

  test.beforeEach(async () => {
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    await auctions.deleteMany({});
  });

  test('should update an existing in person auction with a valid user', async () => {
    // First, create an auction to update
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const existingAuction = {
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Draft', // Must be Draft to allow updates
      title: 'Original Title',
      description: 'Original Description',
      // Add other required fields based on your auction schema
    };
    
    await auctions.insertOne(existingAuction);

    // Prepare update data (only updatable fields for Draft status)
    const updateData = {
      title: 'Updated Title',
      description: 'Updated Description',
      // Don't include status, auction_type, or fields restricted for Published auctions
    };

    const event = LambdaEventFactory.createPatchEvent(
      { 'cognito:username': sellerEmail }, // claims
      updateData, // body
      { auction_id: auctionId } // pathParameters 
    );

    const response = await update_auction(event);
    expect(response.statusCode).toBe(204);

    // Verify the auction was actually updated
    const updatedAuction = await auctions.findOne({ auction_id: auctionId });
    expect(updatedAuction).toBeTruthy();
    expect(updatedAuction.title).toBe('Updated Title');
    expect(updatedAuction.description).toBe('Updated Description');
  });

  test('should return 403 Forbidden if the user is not authenticated', async () => {
    const updateData = { title: 'Updated Title' };
    
    // Pass null claims to simulate unauthenticated user
    const event = LambdaEventFactory.createPatchEvent(
      null, // claims = null
      updateData,
      { auction_id: auctionId }
    );

    const response = await update_auction(event);
    expect(response.statusCode).toBe(403);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('You do not have access to perform this API action');
  });

  test('should return 404 if auction not found', async () => {
    const updateData = { title: 'Updated Title' };
    
    const event = LambdaEventFactory.createPatchEvent(
      { 'cognito:username': sellerEmail },
      updateData,
      { auction_id: 'NON-EXISTENT-ID' }
    );

    const response = await update_auction(event);
    expect(response.statusCode).toBe(404);
    
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Auction not found');
  });

  test('should return 400 if trying to update restricted fields for published auction', async () => {
    // First, create a published auction
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
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
      currency: 'EUR' // This field cannot be updated for published auctions
    };

    const event = LambdaEventFactory.createPatchEvent(
      { 'cognito:username': sellerEmail },
      updateData,
      { auction_id: auctionId }
    );

    const response = await update_auction(event);
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.message).toContain(`Cannot update field 'currency' for a published auction.`);
  });

  test('should return 400 if trying to update status or auction_type', async () => {
    // Create a draft auction
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const existingAuction = {
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Draft',
      auction_type: 'Classic'
    };
    
    await auctions.insertOne(existingAuction);

    // Try to update status (not allowed)
    const updateData = {
      status: 'Published'
    };

    const event = LambdaEventFactory.createPatchEvent(
      { 'cognito:username': sellerEmail },
      updateData,
      { auction_id: auctionId }
    );

    const response = await update_auction(event);
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Status and Auction Type cannot be updated');
  });
});