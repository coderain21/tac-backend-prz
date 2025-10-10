import Module from 'module';
import path from 'path';
import { test, expect } from '@playwright/test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { loadEnvironmentVariables } from '../lib/env_loader';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Monkey-patch require paths for handler
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
  const rootDir = path.resolve(__dirname, '../../');
  if (parent && parent.filename.includes('services/in-person-buyer/handlers/place_bid.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};

loadEnvironmentVariables('services/in-person-buyer/');

const { place_bid } = require('../../services/in-person-buyer/handlers/place_bid.js');

test.describe('Place Bid - Negative Cases', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME || 'test-user@example.com';
  const auctionId = `TEST-AUCTION-${Date.now()}`;
  const lotId = `TEST-LOT-${Date.now()}`;
  const buyerId = `TEST-BUYER-${Date.now()}`;
  
  let queryLotId: string;
  let queryBuyerId: string;
  let queryAuctionObjectId: ObjectId;

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

  async function setupPassengers() {
    const stage = process.env.STAGE || 'test';
    const users = db.collection(`${stage}-users`);
    const auctions = db.collection(`${stage}-auctions`);
    const lots = db.collection(`${stage}-lots`);
    const buyers = db.collection(`${stage}-buyers`);
    const registeredUsers = db.collection(`${stage}-register-auction`);
    const liveBids = db.collection(`${stage}-live-bids`);

    // Clean up test data
    await registeredUsers.deleteMany({ email_address: 'buyer@example.com' });
    await liveBids.deleteMany({ seller_email: sellerEmail });
    await buyers.deleteMany({ buyer_id: { $regex: '^TEST-BUYER-' } });
    await lots.deleteMany({ lot_id: { $regex: '^TEST-LOT-' } });
    await auctions.deleteMany({ auction_id: { $regex: '^TEST-AUCTION-' } });
    await users.deleteMany({ seller_id: 'S-API' });
    await delay(350); // Short consistency delay

    const insertOptions = { writeConcern: { w: 'majority', j: true } };

    // User
    await users.insertOne({
      email_address: sellerEmail,
      first_name: 'Api',
      last_name: 'User',
      seller_id: 'S-API'
    }, insertOptions);

    // Auction
    const futureStartDate = Date.now() + (2 * 60 * 60 * 1000);
    const auctionData = await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Published',
      start_date: futureStartDate,
      accept_absentee_bid: true,
      accept_telephone_bid: true,
      auction_type: 'live',
      menu_links: [],
      auction_image: '',
      faq: [],
      fees: '',
      total_lots: 0
    }, insertOptions);
    queryAuctionObjectId = auctionData.insertedId;

    // Lot
    const lotData = await lots.insertOne({
      lot_id: lotId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      title: 'Test Lot',
      tags: [],
      images: []
    }, insertOptions);
    queryLotId = lotData.insertedId.toString();

    // Buyer
    const buyerData = await buyers.insertOne({
      buyer_id: buyerId,
      auction_id: auctionId,
      seller_email: sellerEmail,
      name: 'Test Buyer',
      email_address: 'buyer@example.com',
      newsletter_notification: false,
      terms_and_condition: false,
      first_name: '',
      last_name: '',
      registered_through: ''
    }, insertOptions);
    queryBuyerId = buyerData.insertedId.toString();

    // Registration
    await registeredUsers.insertOne({
      auction_id: queryAuctionObjectId,
      email_address: 'buyer@example.com',
      seller_email: sellerEmail,
      created_at: new Date(),
      updated_at: new Date(),
      first_name: '',
      last_name: '',
      status: 'active'
    }, insertOptions);

    await delay(350);
    return { queryLotId, queryBuyerId, auctionId, sellerEmail };
  }

  test('should return 404 when lot not found', async () => {
    const { queryBuyerId, auctionId, sellerEmail } = await setupPassengers();

    const bidData = {
      lot_id: new ObjectId().toString(),
      buyer_id: queryBuyerId,
      bid_amount: 5000,
      paddle_number: 1,
      auction_id: auctionId,
      bid_type: 'absentee',
      seller_email: sellerEmail
    };

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': 'buyer@example.com' }
        }
      },
      body: JSON.stringify(bidData)
    };

    const response = await place_bid(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Lot not found');
  });

  test('should return 404 when auction not found', async () => {
    const { queryLotId, queryBuyerId, sellerEmail } = await setupPassengers();

    const bidData = {
      lot_id: queryLotId,
      buyer_id: queryBuyerId,
      bid_amount: 5000,
      paddle_number: 1,
      auction_id: 'NON-EXISTENT-AUCTION-ID',
      bid_type: 'absentee',
      seller_email: sellerEmail
    };

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': 'buyer@example.com' }
        }
      },
      body: JSON.stringify(bidData)
    };

    const response = await place_bid(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Auction not found');
  });
});
