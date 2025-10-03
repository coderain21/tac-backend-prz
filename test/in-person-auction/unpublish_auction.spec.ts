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
  if (parent && parent.filename.includes('services/in-person-auction/handlers/unpublish_auction.js')) {
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
const { unpublish_auction } = require('../../services/in-person-auction/handlers/unpublish_auction.js');

test.describe('Unpublish Auction Handler Tests', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME || 'test-user@example.com';
  const otherSellerEmail = 'other@example.com';

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_CLIENT || 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(process.env.DATABASE || 'indyauction-test');
  });

  test.afterAll(async () => {
    await closeDatabaseConnection();
  });

  let publishedAuctionId: string;
  let draftAuctionId: string;
  let otherSellerAuctionId: string;

  test.beforeEach(async () => {
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    await auctions.deleteMany({});

    // Create a published auction
    const publishedAuctionData = {
      ...auctionTestData.getData('Classic'),
      seller_email: sellerEmail,
      status: 'Published'
    };
    const publishedResult = await auctions.insertOne(publishedAuctionData);
    publishedAuctionId = publishedAuctionData.auction_id;

    // Create a draft auction
    const draftAuctionData = {
      ...auctionTestData.getData('Classic'),
      auction_id: 'DRAFT001',
      seller_email: sellerEmail,
      status: 'Draft'
    };
    const draftResult = await auctions.insertOne(draftAuctionData);
    draftAuctionId = draftAuctionData.auction_id;

    // Create an auction owned by another seller
    const otherSellerAuctionData = {
      ...auctionTestData.getData('Classic'),
      auction_id: 'OTHER001',
      seller_email: otherSellerEmail,
      status: 'Published'
    };
    const otherSellerResult = await auctions.insertOne(otherSellerAuctionData);
    otherSellerAuctionId = otherSellerAuctionData.auction_id;
  });

  test('should return 403 when no authorization claims are provided', async () => {
    const requestBody = {
      auction_id: publishedAuctionId,
      seller_email: sellerEmail
    };

    const event = {
      body: JSON.stringify(requestBody),
      requestContext: {
        authorizer: {} // No claims
      }
    };

    const response = await unpublish_auction(event);
    expect(response.statusCode).toBe(403);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('You do not have access to perform this API action');
  });

  test('should return 403 when cognito:username is missing from claims', async () => {
    const requestBody = {
      auction_id: publishedAuctionId,
      seller_email: sellerEmail
    };

    const event = {
      body: JSON.stringify(requestBody),
      requestContext: {
        authorizer: {
          claims: {} // No cognito:username
        }
      }
    };

    const response = await unpublish_auction(event);
    expect(response.statusCode).toBe(403);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('You do not have access to perform this API action');
  });

  test('should return 400 when required parameters are missing', async () => {
    const requestBody = {
      // Missing auction_id and seller_email
    };

    const event = {
      body: JSON.stringify(requestBody),
      requestContext: {
        authorizer: {
          claims: {
            'cognito:username': sellerEmail
          }
        }
      }
    };

    const response = await unpublish_auction(event);
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Missing required parameters');
  });

  test('should return 400 when only auction_id is provided', async () => {
    const requestBody = {
      auction_id: publishedAuctionId
      // Missing seller_email
    };

    const event = {
      body: JSON.stringify(requestBody),
      requestContext: {
        authorizer: {
          claims: {
            'cognito:username': sellerEmail
          }
        }
      }
    };

    const response = await unpublish_auction(event);
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Missing required parameters');
  });

  test('should return 403 when seller_email in request body does not match cognito username', async () => {
    const requestBody = {
      auction_id: publishedAuctionId,
      seller_email: otherSellerEmail // Different from cognito username
    };

    const event = {
      body: JSON.stringify(requestBody),
      requestContext: {
        authorizer: {
          claims: {
            'cognito:username': sellerEmail
          }
        }
      }
    };

    const response = await unpublish_auction(event);
    expect(response.statusCode).toBe(403);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('You do not have access to perform this API action');
  });



  test('should successfully unpublish a published auction', async () => {
    const requestBody = {
      auction_id: publishedAuctionId,
      seller_email: sellerEmail
    };

    const event = {
      body: JSON.stringify(requestBody),
      requestContext: {
        authorizer: {
          claims: {
            'cognito:username': sellerEmail
          }
        }
      }
    };

    const response = await unpublish_auction(event);
    expect(response.statusCode).toBe(204);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Successfully Updated');

    // Verify the auction status was actually updated in the database
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const updatedAuction = await auctions.findOne({
      auction_id: publishedAuctionId,
      seller_email: sellerEmail
    });

    expect(updatedAuction).not.toBeNull();
    expect(updatedAuction!.status).toBe('Draft');
    expect(updatedAuction!.unpublish_session_started_at).toBeDefined();
    expect(typeof updatedAuction!.unpublish_session_started_at).toBe('number');
  });

  test('should handle non-existent auction gracefully', async () => {
    const requestBody = {
      auction_id: 'NON_EXISTENT_AUCTION',
      seller_email: sellerEmail
    };

    const event = {
      body: JSON.stringify(requestBody),
      requestContext: {
        authorizer: {
          claims: {
            'cognito:username': sellerEmail
          }
        }
      }
    };

    const response = await unpublish_auction(event);
    // This should return 500 because the handler doesn't handle the case where no auction is found
    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Internal Server Error');
  });

  test('should handle malformed JSON in request body', async () => {
    const event = {
      body: 'invalid json',
      requestContext: {
        authorizer: {
          claims: {
            'cognito:username': sellerEmail
          }
        }
      }
    };

    const response = await unpublish_auction(event);
    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body.message).toBe('Internal Server Error');
  });
});