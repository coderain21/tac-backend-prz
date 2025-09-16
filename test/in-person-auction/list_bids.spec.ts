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
  const sellerEmail = process.env.API_USERNAME || 'test-user@example.com';
  
  let auctionId: string;

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_CLIENT || 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(process.env.DATABASE || 'indyauction-test');
    console.log('✅ Database connected');
  });

  test.beforeEach(async () => {
    const stage = process.env.STAGE || 'test';
    const auctions = db.collection(`${stage}-auctions`);
    const liveBids = db.collection(`${stage}-live-bids`);
    
    // Clean up all test data more aggressively
    await liveBids.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^(CANCEL|TEST|DELETE|COMPLETED)-/ }
    });
    await auctions.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^(CANCEL|TEST|DELETE|COMPLETED)-/ }
    });
    await delay(1000); // Give more time for cleanup
  });

  test.afterAll(async () => {
    if (client) {
      await client.close();
      console.log('✅ Database connection closed');
    }
  });

  async function setupTestData() {
    const auctions = db.collection(`${process.env.STAGE || 'test'}-auctions`);
    const liveBids = db.collection(`${process.env.STAGE || 'test'}-live-bids`);

    // Generate unique auction ID with timestamp for better isolation
    auctionId = `LIST-BIDS-TEST-${Date.now()}-${Math.random()}`;

    // Clean up test data more specifically
    await liveBids.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^LIST-BIDS-TEST-/ }
    });
    await auctions.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^LIST-BIDS-TEST-/ }
    });
    await delay(500);

    const insertOptions = { writeConcern: { w: 'majority', j: true } };

    // Create auction
    await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Published',
      auction_type: 'live',
      created_at: new Date(),
      updated_at: new Date()
    }, insertOptions);

    // Create test bids with diverse data for comprehensive testing
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
    await delay(500); // Ensure write consistency

    // Verify data was inserted correctly
    const insertedCount = await liveBids.countDocuments({ 
      auction_id: auctionId, 
      seller_email: sellerEmail 
    });
    
    console.log(`✅ Setup complete: ${insertedCount} bids created for auction ${auctionId}`);
    
    return { auctionId, sellerEmail };
  }

  // SUCCESS TESTS - Fixed to work with current handler behavior

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
    expect(body.data).toHaveLength(1); // Only 1 telephone bid
    
    // ✅ FIXED: Access first element of array
    expect(body.data[0].name).toBe('Jane Smith');
    expect(body.data[0].lot_title).toBe('Antique Furniture Set');
  });


  // VALIDATION TESTS - Parameter validation
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

  // AUTHORIZATION TESTS - Security validation
  test('should return 403 when user is not authorized', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {} // Missing cognito:username
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

  // RESOURCE ACCESS TESTS
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
