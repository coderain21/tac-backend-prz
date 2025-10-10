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
  if (parent && parent.filename.includes('services/in-person-auction/handlers/mark_complete.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};

loadEnvironmentVariables('services/in-person-auction/');

const { mark_complete } = require('../../services/in-person-auction/handlers/mark_complete.js');

test.describe('Mark Complete Auction - Basic Functionality', () => {
  let db: Db;
  let client: MongoClient;

  const sellerEmail = process.env.API_USERNAME || 'test-user@example.com';
  
  let queryAuctionObjectId: ObjectId;
  let auctionId: string;

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_CLIENT || 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(process.env.DATABASE || 'indyauction-test');
  });

  test.beforeEach(async () => {
    const stage = process.env.STAGE || 'test';
    const auctions = db.collection(`${stage}-auctions`);
    // Clean up all test data more aggressively
    await auctions.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^(CANCEL|TEST|DELETE|COMPLETED)-/ }
    });
    await delay(1000); // Give more time for cleanup
  });

  test.afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  async function setupTestData(auctionStatus = 'Published') {
    const auctions = db.collection(`${process.env.STAGE || 'test'}-auctions`);

    // Generate unique auction ID first
    auctionId = `MARK-COMPLETE-TEST-${Date.now()}-${Math.random()}`;

    // Clean up test data more specifically
    await auctions.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^MARK-COMPLETE-TEST-/ }
    });
    await delay(350);

    const insertOptions = { writeConcern: { w: 'majority', j: true } };

    // Create auction with specified status
    const auctionInsertResult = await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: auctionStatus,
      auction_type: 'live',
      start_date: Date.now() + (2 * 60 * 60 * 1000),
      accept_absentee_bid: true,
      accept_telephone_bid: true,
      total_lots: 0
    }, insertOptions);
    
    queryAuctionObjectId = auctionInsertResult.insertedId;

    await delay(350);
    return { queryAuctionObjectId, auctionId, sellerEmail };
  }

  test('should return 204 when auction is successfully marked complete', async () => {
    await setupTestData('Published'); // Start with Published status

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        auction_id: auctionId,
        status: 'Completed'
      })
    };

    const response = await mark_complete(event);
    expect(response.statusCode).toBe(204);

    // Verify auction status was updated in database
    const auctions = db.collection(`${process.env.STAGE || 'test'}-auctions`);
    const updatedAuction = await auctions.findOne({ auction_id: auctionId });
    expect(updatedAuction?.status).toBe('Completed');
  });

  test('should return 400 when auction_id is missing', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        status: 'Completed'
      })
    };

    const response = await mark_complete(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Auction ID and Status are required');
  });

  test('should return 400 when status is missing', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        auction_id: auctionId
      })
    };

    const response = await mark_complete(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Auction ID and Status are required');
  });

  test('should return 400 when request body is invalid', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: null
    };

    const response = await mark_complete(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Invalid request body');
  });

  test('should return 403 when user is not authorized', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {}
        }
      },
      body: JSON.stringify({
        auction_id: 'TEST-AUCTION-123',
        status: 'Completed'
      })
    };

    const response = await mark_complete(event);
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
      body: JSON.stringify({
        auction_id: 'TEST-AUCTION-123',
        status: 'Completed'
      })
    };

    const response = await mark_complete(event);
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
      body: JSON.stringify({
        auction_id: 'NON-EXISTENT-AUCTION',
        status: 'Completed'
      })
    };

    const response = await mark_complete(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Auction not found');
  });

  test('should return 404 when auction belongs to different seller', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': 'different-seller@example.com' }
        }
      },
      body: JSON.stringify({
        auction_id: auctionId,
        status: 'Completed'
      })
    };

    const response = await mark_complete(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Auction not found');
  });

  test('should return 400 when trying to complete draft auction', async () => {
    await setupTestData('Draft'); // Create auction with Draft status

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        auction_id: auctionId,
        status: 'Completed'
      })
    };

    const response = await mark_complete(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Cannot complete a draft or completed auction or cancelled auction');
  });

  test('should return 400 when trying to complete already completed auction', async () => {
  // Use the setupTestData function for consistency
  await setupTestData('Completed');

  const event = {
    requestContext: {
      authorizer: {
        claims: { 'cognito:username': sellerEmail }
      }
    },
    body: JSON.stringify({
      auction_id: auctionId,
      status: 'Completed'
    })
  };

  const response = await mark_complete(event);
  expect(response.statusCode).toBe(400);
  expect(JSON.parse(response.body).message).toBe('Cannot complete a draft or completed auction or cancelled auction');
});




  test('should handle malformed JSON in request body', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: '{ invalid json }'
    };

    const response = await mark_complete(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBe('Internal Server Error');
  });
});
