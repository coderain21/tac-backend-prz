import Module from 'module';
import path from 'path';
import { test, expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';
import { LambdaEventFactory } from '../lib/lambda_event_factory';
import { lotTestData, bidTestData } from '../lib/test_data_manager';
import {
  connectToDatabase,
  getDb,
  closeDatabaseConnection,
} from '../lib/db_helper';

// --- MONKEY-PATCH TO FIX BROKEN REQUIRE PATHS ---
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
  const rootDir = path.resolve(__dirname, '../../');
  if (parent && parent.filename.includes('services/lot-bid-history/handlers/list.js')) {
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
const { handler } = require('../../services/lot-bid-history/handlers/list.js');

test.describe('Lot Bid History API', () => {
  let db: ReturnType<typeof getDb>;

  test.beforeAll(async () => {
    await connectToDatabase();
    db = getDb();
  });

  test.afterAll(async () => {
    await closeDatabaseConnection();
  });

  test('should return 200 OK and a list of bids for a valid lot ID', async () => {
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const bidInformation = db.collection(`${process.env.STAGE}-bid-informations`);
    const uniqueBids = db.collection(`${process.env.STAGE}-unique-bids`);

    await Promise.all([
      lots.deleteMany({}),
      bidInformation.deleteMany({}),
      uniqueBids.deleteMany({})
    ]);

    const lotObjectId = new ObjectId();
    const lotIdAsString = lotObjectId.toHexString();

    // Insert test lot
    const lotData = {
      ...lotTestData.getData('baseLot'),
      _id: lotObjectId,
      current_bid: 300,
      top_bidder: 'Katrina Stokes',
      seller_email: 'test-seller@example.com'
    };
    await lots.insertOne(lotData);

    const now = new Date();
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
        created_at: now,
        updated_at: now,
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
        created_at: now,
        updated_at: now,
        location: 'California',
      }
    ];

    await Promise.all([
      bidInformation.insertMany(bidInfoData),
      uniqueBids.insertMany(bidInfoData)
    ]);

    const event = LambdaEventFactory.createGetEvent(
      null,
      { lot_id: lotIdAsString, page: '1', limit: '10' },
      null
    );

    const response = await handler(event);

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

    expect(response.statusCode).toBe(404);
  });
});
