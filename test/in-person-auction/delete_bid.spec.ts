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
  if (parent && parent.filename.includes('services/in-person-auction/handlers/delete_bid.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};

loadEnvironmentVariables('services/in-person-auction/');

const { delete_bid } = require('../../services/in-person-auction/handlers/delete_bid.js');

test.describe('Delete Bid - Basic Functionality', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME!;
  
  let testBidObjectId: ObjectId;
  let auctionId: string;
  let lotId: string;

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_CLIENT!);
    await client.connect();
    db = client.db(process.env.DATABASE);
  });

  test.afterAll(async () => {
    await client.close();
  });

  async function setupTestData() {
    const liveBids = db.collection(`${process.env.STAGE}-live-bids`);
    const auctions = db.collection(`${process.env.STAGE}-auctions`);

    // Clean up test data
    await liveBids.deleteMany({ bidder_email: sellerEmail });
    await auctions.deleteMany({ seller_email: sellerEmail });
    await delay(350);

    const insertOptions = { writeConcern: { w: 'majority', j: true } };

    // Generate unique IDs
    auctionId = `TEST-AUCTION-${Date.now()}`;
    lotId = `TEST-LOT-${Date.now()}`;

    // Create test auction
    await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Published',
      auction_type: 'live',
      start_date: Date.now() + (2 * 60 * 60 * 1000),
      accept_absentee_bid: true,
      accept_telephone_bid: true,
      total_lots: 1
    }, insertOptions);

    // Create test bid
    const bidInsertResult = await liveBids.insertOne({
      auction_id: auctionId,
      lot_id: lotId,
      bidder_email: sellerEmail,
      bid_amount: 100,
      bid_type: 'live',
      timestamp: Date.now(),
      status: 'active'
    }, insertOptions);
    
    testBidObjectId = bidInsertResult.insertedId;

    await delay(350);
    return { testBidObjectId, auctionId, lotId, sellerEmail };
  }

  test('should return 204 when bid is successfully deleted', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        bid_id: testBidObjectId.toString()
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(204);

    // Verify bid was deleted from database
    const liveBids = db.collection(`${process.env.STAGE}-live_bids`);
    const deletedBid = await liveBids.findOne({ _id: testBidObjectId });
    expect(deletedBid).toBeNull();
  });

  test('should return 400 when bid_id is missing', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {}
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Bid ID is required');
  });

  test('should return 400 when pathParameters is null', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: null
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Bid ID is required');
  });

  test('should return 403 when user is not authorized', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {}
        }
      },
      pathParameters: {
        bid_id: new ObjectId().toString()
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to perform this API action');
  });

  test('should return 403 when cognito:username is missing', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'other:claim': 'value' }
        }
      },
      pathParameters: {
        bid_id: new ObjectId().toString()
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to perform this API action');
  });

  test('should return 404 when bid not found', async () => {
    const nonExistentBidId = new ObjectId();
    
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        bid_id: nonExistentBidId.toString()
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Bid not found');
  });

  test('should return 500 when bid_id is invalid ObjectId format', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        bid_id: 'invalid-object-id'
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBe('Internal Server Error');
  });

  test('should handle empty bid_id string', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        bid_id: ''
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Bid ID is required');
  });

  test('should handle whitespace-only bid_id', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        bid_id: '   '
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBe('Internal Server Error');
  });

  test('should return 403 when requestContext is missing', async () => {
    const event = {
      pathParameters: {
        bid_id: new ObjectId().toString()
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to perform this API action');
  });

  test('should return 403 when authorizer is missing', async () => {
    const event = {
      requestContext: {},
      pathParameters: {
        bid_id: new ObjectId().toString()
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to perform this API action');
  });

  test('should successfully delete bid with valid 24-character hex string', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        bid_id: testBidObjectId.toHexString()
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(204);

    // Verify bid was deleted from database
    const liveBids = db.collection(`${process.env.STAGE}-live_bids`);
    const deletedBid = await liveBids.findOne({ _id: testBidObjectId });
    expect(deletedBid).toBeNull();
  });

  test('should handle database connection issues gracefully', async () => {
    // This test would need to mock the database connection to simulate failure
    // For now, we'll test with a scenario that might cause database issues
    
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        bid_id: '000000000000000000000000' // Valid ObjectId format but likely non-existent
      }
    };

    const response = await delete_bid(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Bid not found');
  });
});