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
  if (parent && parent.filename.includes('services/in-person-auction/handlers/delete_auction.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};

loadEnvironmentVariables('services/in-person-auction/');

const { delete_auction } = require('../../services/in-person-auction/handlers/delete_auction.js');

test.describe('Delete Auction - Complete Tests', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME!;
  
  let auctionId: string;
  let queryAuctionObjectId: ObjectId;

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
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const liveBids = db.collection(`${process.env.STAGE}-live-bids`);
    const registeredUsers = db.collection(`${process.env.STAGE}-register-auction`);
    const buyerWishlists = db.collection(`${process.env.STAGE}-buyer-wishlists`);

    // Clean up test data
    await liveBids.deleteMany({ seller_email: sellerEmail });
    await lots.deleteMany({ seller_email: sellerEmail });
    await registeredUsers.deleteMany({ seller_email: sellerEmail });
    await buyerWishlists.deleteMany({ seller_email: sellerEmail });
    await auctions.deleteMany({ seller_email: sellerEmail });
    await delay(500);

    const insertOptions = { writeConcern: { w: 'majority', j: true } };

    // Generate unique auction ID
    auctionId = `TEST-AUCTION-${Date.now()}`;

    // Create auction
    const auctionInsertResult = await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Published',
      auction_type: 'live',
      start_date: Date.now() + (2 * 60 * 60 * 1000),
      total_lots: 2
    }, insertOptions);
    
    queryAuctionObjectId = auctionInsertResult.insertedId;

    // Create related lots
    await lots.insertMany([
      {
        auction_id: auctionId,
        seller_email: sellerEmail,
        lot_number: 1,
        title: 'Test Lot 1',
        status: 'active'
      },
      {
        auction_id: auctionId,
        seller_email: sellerEmail,
        lot_number: 2,
        title: 'Test Lot 2',
        status: 'active'
      }
    ], insertOptions);

    // Create related live bids
    await liveBids.insertMany([
      {
        auction_id: auctionId,
        seller_email: sellerEmail,
        bid_type: 'absentee',
        lot_number: 1,
        bid_amount: 1000,
        buyer_id: 'buyer1'
      },
      {
        auction_id: auctionId,
        seller_email: sellerEmail,
        bid_type: 'telephone',
        lot_number: 2,
        bid_amount: 2000,
        buyer_id: 'buyer2'
      }
    ], insertOptions);

    // Create registered bidders
    await registeredUsers.insertMany([
      {
        auction_id: queryAuctionObjectId,
        seller_email: sellerEmail,
        email_address: 'bidder1@example.com',
        status: 'active'
      },
      {
        auction_id: queryAuctionObjectId,
        seller_email: sellerEmail,
        email_address: 'bidder2@example.com',
        status: 'active'
      }
    ], insertOptions);

    // Create buyer wishlists
    await buyerWishlists.insertMany([
      {
        auction_id: auctionId,
        seller_email: sellerEmail,
        buyer_id: 'buyer1',
        lot_id: 'lot1',
        added_at: new Date()
      },
      {
        auction_id: auctionId,
        seller_email: sellerEmail,
        buyer_id: 'buyer2',
        lot_id: 'lot2',
        added_at: new Date()
      }
    ], insertOptions);

    await delay(500);
    return { auctionId, queryAuctionObjectId, sellerEmail };
  }

  test('should return 204 and delete auction with all related data including wishlists', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        auction_id: auctionId
      }
    };

    const response = await delete_auction(event);
    expect(response.statusCode).toBe(204);

    // Verify auction is deleted
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const auctionExists = await auctions.findOne({ auction_id: auctionId });
    expect(auctionExists).toBeNull();

    // Verify related lots are deleted
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const lotsCount = await lots.countDocuments({ auction_id: auctionId });
    expect(lotsCount).toBe(0);

    // Verify related live bids are deleted
    const liveBids = db.collection(`${process.env.STAGE}-live-bids`);
    const bidsCount = await liveBids.countDocuments({ auction_id: auctionId });
    expect(bidsCount).toBe(0);

    // Verify related registered users are deleted
    const registeredUsers = db.collection(`${process.env.STAGE}-register-auction`);
    const usersCount = await registeredUsers.countDocuments({ auction_id: queryAuctionObjectId });
    expect(usersCount).toBe(0);

    // Verify related buyer wishlists are deleted
    const buyerWishlists = db.collection(`${process.env.STAGE}-buyer-wishlists`);
    const wishlistsCount = await buyerWishlists.countDocuments({ auction_id: auctionId });
    expect(wishlistsCount).toBe(0);
  });

  test('should return 400 when auction_id is missing', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {}
    };

    const response = await delete_auction(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Auction ID is required');
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

    const response = await delete_auction(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Auction ID is required');
  });

  test('should return 403 when user is not authorized', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {}
        }
      },
      pathParameters: {
        auction_id: 'TEST-AUCTION-123'
      }
    };

    const response = await delete_auction(event);
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
        auction_id: 'TEST-AUCTION-123'
      }
    };

    const response = await delete_auction(event);
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
    pathParameters: {
      auction_id: 'NON-EXISTENT-AUCTION'
    }
  };

  const response = await delete_auction(event);
  expect(response.statusCode).toBe(404); // Will work after handler fix
  expect(JSON.parse(response.body).message).toBe('Auction not found or you do not have permission to delete it');
});

test('should return 404 when auction belongs to different seller', async () => {
  await setupTestData();

  const event = {
    requestContext: {
      authorizer: {
        claims: { 'cognito:username': 'different-seller@example.com' }
      }
    },
    pathParameters: {
      auction_id: auctionId
    }
  };

  const response = await delete_auction(event);
  expect(response.statusCode).toBe(404); // Will work after handler fix
  expect(JSON.parse(response.body).message).toBe('Auction not found or you do not have permission to delete it');
});


  test('should handle deletion when only some related data exists', async () => {
    // Create auction with only wishlists, no other related data
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const buyerWishlists = db.collection(`${process.env.STAGE}-buyer-wishlists`);
    
    await auctions.deleteMany({ seller_email: sellerEmail });
    await buyerWishlists.deleteMany({ seller_email: sellerEmail });
    await delay(200);

    const partialAuctionId = `TEST-PARTIAL-${Date.now()}`;
    const insertResult = await auctions.insertOne({
      auction_id: partialAuctionId,
      seller_email: sellerEmail,
      status: 'Draft',
      auction_type: 'live'
    });

    // Create only wishlists
    await buyerWishlists.insertOne({
      auction_id: partialAuctionId,
      seller_email: sellerEmail,
      buyer_id: 'buyer1',
      lot_id: 'lot1'
    });

    await delay(200);

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        auction_id: partialAuctionId
      }
    };

    const response = await delete_auction(event);
    expect(response.statusCode).toBe(204);

    // Verify auction is deleted
    const auctionExists = await auctions.findOne({ auction_id: partialAuctionId });
    expect(auctionExists).toBeNull();

    // Verify wishlists are deleted
    const wishlistsCount = await buyerWishlists.countDocuments({ auction_id: partialAuctionId });
    expect(wishlistsCount).toBe(0);
  });

  test('should handle case when auction is already deleted', async () => {
    await setupTestData();

    // First deletion
    const event1 = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        auction_id: auctionId
      }
    };

    const response1 = await delete_auction(event1);
    expect(response1.statusCode).toBe(204);

    // Second deletion attempt
    const event2 = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        auction_id: auctionId
      }
    };

    const response2 = await delete_auction(event2);
    expect(response2.statusCode).toBe(404);
    expect(JSON.parse(response2.body).message).toBe('Auction not found or you do not have permission to delete it');
  });

  test('should preserve other seller data when deleting auction', async () => {
    await setupTestData();

    // Create data for different seller
    const otherSellerEmail = 'other-seller@example.com';
    const otherAuctionId = `OTHER-AUCTION-${Date.now()}`;

    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const buyerWishlists = db.collection(`${process.env.STAGE}-buyer-wishlists`);

    await auctions.insertOne({
      auction_id: otherAuctionId,
      seller_email: otherSellerEmail,
      status: 'Published'
    });

    await lots.insertOne({
      auction_id: otherAuctionId,
      seller_email: otherSellerEmail,
      lot_number: 1,
      title: 'Other Lot'
    });

    await buyerWishlists.insertOne({
      auction_id: otherAuctionId,
      seller_email: otherSellerEmail,
      buyer_id: 'other-buyer',
      lot_id: 'other-lot'
    });

    // Delete first seller's auction
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        auction_id: auctionId
      }
    };

    const response = await delete_auction(event);
    expect(response.statusCode).toBe(204);

    // Verify other seller's data still exists
    const otherAuctionExists = await auctions.findOne({ auction_id: otherAuctionId });
    expect(otherAuctionExists).not.toBeNull();

    const otherLotsCount = await lots.countDocuments({ auction_id: otherAuctionId });
    expect(otherLotsCount).toBe(1);

    const otherWishlistsCount = await buyerWishlists.countDocuments({ auction_id: otherAuctionId });
    expect(otherWishlistsCount).toBe(1);

    // Cleanup other seller's data
    await auctions.deleteMany({ seller_email: otherSellerEmail });
    await lots.deleteMany({ seller_email: otherSellerEmail });
    await buyerWishlists.deleteMany({ seller_email: otherSellerEmail });
  });

  test('should handle 500 error gracefully', async () => {
    // Create an event that will cause an error (invalid auction_id format that breaks ObjectId)
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      pathParameters: {
        auction_id: 'INVALID-AUCTION-ID-THAT-BREAKS-OBJECTID'
      }
    };

    const response = await delete_auction(event);
    
    // Should handle error gracefully and return 500 or 404
    expect([404, 500]).toContain(response.statusCode);
    expect(JSON.parse(response.body)).toHaveProperty('message');
  });
});
