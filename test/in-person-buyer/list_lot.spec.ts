import Module from 'module';
import path from 'path';
import { test, expect } from '@playwright/test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';
import { LambdaEventFactory } from '../lib/lambda_event_factory';
import { auctionTestData,lotTestData } from '../lib/test_data_manager';
import { connectToDatabase, closeDatabaseConnection, getDb } from '../lib/db_helper';

// --- MONKEY-PATCH TO FIX BROKEN REQUIRE PATHS ---
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
  const rootDir = path.resolve(__dirname, '../../');
  if (parent && parent.filename.includes('services/in-person-buyer/handlers/list_lot.js')) {
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
const { list_lots } = require('../../services/in-person-buyer/handlers/list_lot.js');

test.describe('In Person Buyer list lot handler tests', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME!;

  test.beforeAll(async () => {
      client = new MongoClient(process.env.MONGO_CLIENT!);
      await client.connect();
      db = client.db(process.env.DATABASE);
  });

  test.afterAll(async () => {
    await closeDatabaseConnection();
  });

  let auctionId: string;

  test.beforeEach(async () => {
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const lots = db.collection(`${process.env.STAGE}-lots`);
    await auctions.deleteMany({});
    await lots.deleteMany({});

    const auctionData = auctionTestData.getData('Classic');
    const result = await auctions.insertOne({
      ...auctionData,
      seller_email: sellerEmail,
    });

    auctionId = result.insertedId.toHexString();
    // console.log('auctionId', auctionId);

    const lotData = lotTestData.getData('Classic');
    lotData.auction_id = auctionData.auction_id; // Use the auction_id from test data, not the ObjectId
    lotData.seller_email = sellerEmail;

    await lots.insertOne(lotData);
  });


  test('should return 200 OK and a list of lots', async () => {
    const event = LambdaEventFactory.createGetEvent(
      {},
      null,
      { auction_id: auctionId, page: '1', per_page: '10' },
    );

    const response = await list_lots(event);
    // console.log('Full response:', JSON.stringify(response, null, 2)); // Debug log
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    // console.log('Response body:', JSON.stringify(body, null, 2)); // Debug log
    
    // Check what properties exist in the response
    console.log('Body keys:', Object.keys(body)); // Debug log
    
    // The response structure is: { current_page, data, total_pages, total_records_found }
    // Verify the pagination structure
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('total_pages');
    expect(body).toHaveProperty('total_records');
    
    // Verify the lots data exists in the 'data' property
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    
    // Verify pagination properties
    expect(body.page).toBe(1);
    expect(body.total_pages).toBeGreaterThanOrEqual(1);
    
    // Additional verification that the lot contains expected data
    const firstLot = body.data[0];
    expect(firstLot).toHaveProperty('_id');
    expect(firstLot).toHaveProperty('lot_number');
    expect(firstLot).toHaveProperty('title1');
    expect(firstLot).toHaveProperty('title2');
    expect(firstLot).toHaveProperty('images');
    
    // Verify images structure
    expect(Array.isArray(firstLot.images)).toBe(true);
  });

  test('should return 400 Bad Request if the auction_id is not provided', async () => {
    const lotData = lotTestData.getData('Classic');

    const event = LambdaEventFactory.createGetEvent(
      {},
      null,
       { page: '1', per_page: '10' },
    );

    const response = await list_lots(event);
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.message).toContain('Please provide auction_id');
  });

  test('should return 422 invalid auction_id', async () => {
    const event = LambdaEventFactory.createGetEvent(
      {},
      null,
      { auction_id: 'invalid-id-format', page: '1', per_page: '10' },
    );

    const response = await list_lots(event);
    expect(response.statusCode).toBe(422);

    const body = JSON.parse(response.body);
    expect(body.message).toContain('Invalid auction ID format');
  })
});