import Module from 'module';
import path from 'path';
import { test, expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';
import { LambdaEventFactory } from '../lib/lambda_event_factory';
import { auctionTestData, lotTestData, bidTestData } from '../lib/test_data_manager';
import {
  connectToDatabase,
  getDb,
  closeDatabaseConnection,
} from '../lib/db_helper';

// --- MONKEY-PATCH TO FIX BROKEN REQUIRE PATHS ---
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
  const rootDir = path.resolve(__dirname, '../../');
  if (parent && parent.filename.includes('services/lot-bid-history/handlers/auction_bids.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};
// --- END OF PATCH ---

loadEnvironmentVariables('services/lot-bid-history');
const { handler } = require('../../services/lot-bid-history/handlers/auction_bids.js');

test.describe('Auction Bids API', () => {
  let db: ReturnType<typeof getDb>;

  test.beforeAll(async () => {
    await connectToDatabase();
    db = getDb();
  });

  test.afterAll(async () => {
    await closeDatabaseConnection();
  });

  test('should return 400 when buyer_id is missing', async () => {
    const auctionObjectId = new ObjectId();
    const event = LambdaEventFactory.createGetEvent(
      null,
      { auction_id: auctionObjectId.toHexString() },
      null
    );

    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('buyer_id is required');
  });

  test('should return 404 when auction not found', async () => {
    const nonExistentAuctionId = new ObjectId();
    const event = LambdaEventFactory.createGetEvent(
      null,
      { auction_id: nonExistentAuctionId.toHexString() },
      { buyer_id: 'buyer-123' }
    );

    const response = await handler(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Auction not found');
  });

  test('should return 200 and grouped bids by lot_id', async () => {
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const bidInformation = db.collection(`${process.env.STAGE}-bid-informations`);

    await Promise.all([
      auctions.deleteMany({}),
      lots.deleteMany({}),
      bidInformation.deleteMany({})
    ]);

    const auctionObjectId = new ObjectId();
    const lot1Id = new ObjectId();
    const lot2Id = new ObjectId();

    // Insert test auction
    const auctionData = {
      ...auctionTestData.getData('Classic'),
      _id: auctionObjectId,
      auction_id: 'A-TEST-001',
      seller_email: 'test-seller@example.com'
    };
    await auctions.insertOne(auctionData);

    // Insert test lots
    const lotsData = [
      {
        ...lotTestData.getData('baseLot'),
        _id: lot1Id,
        auction_id: 'A-TEST-001',
        seller_email: 'test-seller@example.com'
      },
      {
        ...lotTestData.getData('baseLot'),
        _id: lot2Id,
        auction_id: 'A-TEST-001',
        seller_email: 'test-seller@example.com'
      }
    ];
    await lots.insertMany(lotsData);

    // Insert test bids
    const bidData = {
      ...bidTestData.getData('highBid'),
      lot_id: lot1Id.toHexString(),
      buyer_id: 'buyer-123',
      auction_id: 'A-TEST-001',
      seller_email: 'test-seller@example.com',
      bid_amount: 500,
      name: 'Test Buyer',
      time_stamp: Date.now(),
      created_at: new Date(),
      updated_at: new Date()
    };
    await bidInformation.insertOne(bidData);

    const event = LambdaEventFactory.createGetEvent(
      null,
      { auction_id: auctionObjectId.toHexString() },
      { buyer_id: 'buyer-123', page: '1', limit: '10' }
    );

    const response = await handler(event);
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.data).toHaveProperty(lot1Id.toHexString());
    expect(body.data).toHaveProperty(lot2Id.toHexString());
    expect(body.data[lot1Id.toHexString()]).toHaveLength(1);
    expect(body.data[lot2Id.toHexString()]).toHaveLength(0);
    expect(body.pagination.total_lots).toBe(2);
  });
});
