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
  if (parent && parent.filename.includes('services/in-person-auction/handlers/list_bids.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};

loadEnvironmentVariables('services/in-person-auction/');

const { list_bids } = require('../../services/in-person-auction/handlers/list_bids.js');

test.describe('List Bids - Basic Tests', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME!;
  
  let auctionId: string;

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_CLIENT!);
    await client.connect();
    db = client.db(process.env.DATABASE);
  });

  test.afterAll(async () => {
    await client.close();
  });

  async function setupTestData() {
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const liveBids = db.collection(`${process.env.STAGE}-live-bids`);

    // Clean up test data
    await liveBids.deleteMany({ seller_email: sellerEmail });
    await auctions.deleteMany({ seller_email: sellerEmail });
    await delay(500);

    const insertOptions = { writeConcern: { w: 'majority', j: true } };

    // Generate unique auction ID
    auctionId = `TEST-AUCTION-${Date.now()}`;

    // Create auction
    await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Published',
      auction_type: 'live'
    }, insertOptions);

    // Create test bids with only valid bid_types (absentee and telephone)
    const testBids = [
      {
        auction_id: auctionId,
        seller_email: sellerEmail,
        bid_type: 'absentee',
        lot_number: 1,
        paddle_number: 101,
        name: 'John Doe',
        lot_title: 'Vintage Watch Collection',
        bid_amount: 1500,
        created_at: new Date(),
      },
      {
        auction_id: auctionId,
        seller_email: sellerEmail,
        bid_type: 'telephone',
        lot_number: 2,
        paddle_number: 102,
        name: 'Jane Smith',
        lot_title: 'Antique Furniture Set',
        bid_amount: 2500,
        created_at: new Date(),
      },
      {
        auction_id: auctionId,
        seller_email: sellerEmail,
        bid_type: 'absentee',
        lot_number: 3,
        paddle_number: 103,
        name: 'Bob Johnson',
        lot_title: 'Art Painting Original',
        bid_amount: 750,
        created_at: new Date(),
      }
    ];

    await liveBids.insertMany(testBids, insertOptions);
    await delay(500);
    
    return { auctionId, sellerEmail };
  }

  test('should return 200 and list absentee bids with debug', async () => {
    await setupTestData();

    // Debug: Check what's in the database before test
    const liveBids = db.collection(`${process.env.STAGE}-live-bids`);
    const dbBids = await liveBids.find({ 
      auction_id: auctionId, 
      seller_email: sellerEmail 
    }).toArray();
    console.log('Total bids in database:', dbBids.length);
    
    const absenteeBids = await liveBids.find({ 
      auction_id: auctionId, 
      seller_email: sellerEmail,
      bid_type: 'absentee'
    }).toArray();
    console.log('Absentee bids in database:', absenteeBids.length);

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      queryStringParameters: {
        auction_id: auctionId,
        bid_type: 'absentee'
      }
    };

    console.log('Event queryStringParameters:', event.queryStringParameters);

    const response = await list_bids(event);
    
    // Debug output
    console.log('Response status:', response.statusCode);
    if (response.statusCode !== 200) {
      console.log('Error response body:', JSON.parse(response.body));
    } else {
      const body = JSON.parse(response.body);
      console.log('Response data length:', body.data.length);
      console.log('Total records found:', body.total_records_found);
      if (body.data.length > 0) {
        console.log('First bid:', body.data[0]);
      }
    }

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2); // 2 absentee bids

    // Only test structure if we have data
    if (body.data.length > 0) {
      const firstBid = body.data[0];
      expect(firstBid).toHaveProperty('lot_number');
      expect(firstBid).toHaveProperty('name');
      expect(firstBid).toHaveProperty('lot_title');
      expect(firstBid).toHaveProperty('bid_amount');
      expect(firstBid).not.toHaveProperty('_id');

      // Verify both absentee bidders are returned
      const names = body.data.map((bid: any) => bid.name);
      expect(names).toContain('John Doe');
      expect(names).toContain('Bob Johnson');
    }
  });

  test('should return 200 and list telephone bids', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      queryStringParameters: {
        auction_id: auctionId,
        bid_type: 'telephone'
      }
    };

    const response = await list_bids(event);
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(1); // Only 1 telephone bid
    expect(body.data[0].name).toBe('Jane Smith');
    expect(body.data[0].lot_title).toBe('Antique Furniture Set');
  });

  test('should search absentee bids by lot_title keyword', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      queryStringParameters: {
        auction_id: auctionId,
        bid_type: 'absentee',
        search_keyword: 'vintage'
      }
    };

    const response = await list_bids(event);
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].lot_title).toContain('Vintage Watch Collection');
    expect(body.data[0].name).toBe('John Doe');
  });

  test('should return 400 when auction_id is missing', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      queryStringParameters: {
        bid_type: 'absentee'
      }
    };

    const response = await list_bids(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Please provide auction ID');
  });

  test('should return 400 when bid_type is missing', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      queryStringParameters: {
        auction_id: auctionId
      }
    };

    const response = await list_bids(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Please provide valid bid_type');
  });

  test('should return 400 when bid_type is invalid', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      queryStringParameters: {
        auction_id: auctionId,
        bid_type: 'invalid_type'
      }
    };

    const response = await list_bids(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Please provide valid bid_type');
  });

  test('should return 403 when user is not authorized', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {}
        }
      },
      queryStringParameters: {
        auction_id: 'TEST-AUCTION-123',
        bid_type: 'absentee'
      }
    };

    const response = await list_bids(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to perform this API action');
  });

  test('should return 404 when auction not found', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      queryStringParameters: {
        auction_id: 'NON-EXISTENT-AUCTION',
        bid_type: 'absentee'
      }
    };

    const response = await list_bids(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Auction not found');
  });
});
