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
  if (parent && parent.filename.includes('services/in-person-auction/handlers/list_lot.js')) {
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
const { list_lot } = require('../../services/in-person-auction/handlers/list_lot.js');

test.describe('In Person Auction list lot handler tests', () => {
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

    let auctionId: ObjectId;

  test.beforeEach(async () => {
    const users = db.collection(`${process.env.STAGE}-users`);
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const lots = db.collection(`${process.env.STAGE}-lots`);
    await users.deleteMany({});
    await auctions.deleteMany({});
    await lots.deleteMany({});

    await users.insertOne({
      email_address: sellerEmail,
      first_name: 'Api',
      last_name: 'User',
      seller_id: 'S-API'
    });

    const auctionData = auctionTestData.getData('Classic');
    const result = await auctions.insertOne({
      ...auctionData,
      seller_email: sellerEmail,
    });
    auctionId = result.insertedId;

    const lotData = lotTestData.getData('Classic');
    lotData.auction_id = 'A-CLASSIC';
    lotData.seller_email = sellerEmail;
    const result2 = await lots.insertOne(lotData);
    // console.log('result2',result2)
  });


  test('should return 200 OK and a list of lots', async () => {
    const lotData = lotTestData.getData('Classic');
    lotData.auction_id = 'A-CLASSIC';

    const event = LambdaEventFactory.createGetEvent(
      { 'cognito:username': sellerEmail },
      null,
      { auction_id: 'A-CLASSIC', page: '1', limit: '10' },
    );

    const response = await list_lot(event);
    // console.log('response',response);
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    // console.log('body',body)
    
    expect(body.lots.length).toBeGreaterThan(0);
  });


  test('should return 403 Forbidden if the user is not authenticated', async () => {
    const lotData = lotTestData.getData('Classic');
    const event = LambdaEventFactory.createPostEvent(null, lotData, null);

    const response = await list_lot(event);
    expect(response.statusCode).toBe(403);
  });

  test('should return 400 Bad Request if the auction_id is not provided', async () => {
    const lotData = lotTestData.getData('Classic');

    const event = LambdaEventFactory.createGetEvent(
      { 'cognito:username': sellerEmail },
      null,
       { page: '1', limit: '10' },
    );

    const response = await list_lot(event);
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.message).toContain('Please provide auction ID');
  });

  test('should return 404 Not Found if the auction does not exist', async () => {
    const event = LambdaEventFactory.createGetEvent(
      { 'cognito:username': sellerEmail },
      null,
      { auction_id: 'NON-EXISTENT-AUCTION-ID', page: '1', limit: '10' },
    );

    const response = await list_lot(event);
    expect(response.statusCode).toBe(404);

    const body = JSON.parse(response.body);
    expect(body.message).toContain('Auction not found');
  })
});
