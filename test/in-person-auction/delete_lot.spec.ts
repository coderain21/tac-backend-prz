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
  if (parent && parent.filename.includes('services/in-person-auction/handlers/delete_lot.js')) {
    if (request.startsWith('../lib/')) {
      request = path.join(rootDir, 'lib', request.replace('../lib/', ''));
    } else if (request.startsWith('../entities/')) {
      request = path.join(rootDir, 'entities', request.replace('../entities/', ''));
    }
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};

loadEnvironmentVariables('services/in-person-auction/');

const { delete_lot } = require('../../services/in-person-auction/handlers/delete_lot.js');

test.describe('Delete Lot - Basic Functionality', () => {
  let db: Db;
  let client: MongoClient;
  const sellerEmail = process.env.API_USERNAME || 'test-user@example.com';
  
  let testLotObjectId: ObjectId;
  let auctionId: string;
  let lotId: string;

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_CLIENT || 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(process.env.DATABASE || 'indyauction-test');
  });

  test.beforeEach(async () => {
    const stage = process.env.STAGE || 'test';
    const liveBids = db.collection(`${stage}-live-bids`);
    const auctions = db.collection(`${stage}-auctions`);
    const lots = db.collection(`${stage}-lots`);
    const counters = db.collection(`${stage}-counters`);
    
    // Clean up all test data more aggressively
    await liveBids.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^(CANCEL|TEST|DELETE|COMPLETED|DELETE-LOT-TEST)-/ }
    });
    await auctions.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^(CANCEL|TEST|DELETE|COMPLETED|DELETE-LOT-TEST)-/ }
    });
    await lots.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^(CANCEL|TEST|DELETE|COMPLETED|DELETE-LOT-TEST)-/ }
    });
    await counters.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^(CANCEL|TEST|DELETE|COMPLETED|DELETE-LOT-TEST)-/ }
    });
    await delay(1000); // Give more time for cleanup
  });

  test.afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  async function setupTestData() {
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    const counters = db.collection(`${process.env.STAGE}-counters`);

    // Generate unique IDs first
    auctionId = `DELETE-LOT-TEST-${Date.now()}-${Math.random()}`;
    lotId = `DELETE-LOT-TEST-${Date.now()}-${Math.random()}`;

    // Clean up test data more specifically
    await lots.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^DELETE-LOT-TEST-/ }
    });
    await auctions.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^DELETE-LOT-TEST-/ }
    });
    await counters.deleteMany({ 
      seller_email: sellerEmail,
      auction_id: { $regex: /^DELETE-LOT-TEST-/ }
    });
    await delay(350);

    const insertOptions = { writeConcern: { w: 'majority', j: true } };

    // Create test auction in Draft status
    await auctions.insertOne({
      auction_id: auctionId,
      seller_email: sellerEmail,
      status: 'Draft',
      auction_type: 'live',
      start_date: Date.now() + (2 * 60 * 60 * 1000),
      accept_absentee_bid: true,
      accept_telephone_bid: true,
      total_lots: 3
    }, insertOptions);

    // Create counter for lots
    await counters.insertOne({
      seller_email: sellerEmail,
      auction_id: auctionId,
      record_type: 'Lots',
      starting_sequence: 3
    }, insertOptions);

    // Create multiple test lots for sequential numbering
    const lotInsertResult1 = await lots.insertOne({
      _id: new ObjectId(),
      auction_id: auctionId,
      seller_email: sellerEmail,
      lot_number: 1,
      title: 'Test Lot 1',
      description: 'Test lot description 1',
      starting_bid: 50
    }, insertOptions);

    const lotInsertResult2 = await lots.insertOne({
      _id: new ObjectId(),
      auction_id: auctionId,
      seller_email: sellerEmail,
      lot_number: 2,
      title: 'Test Lot 2',
      description: 'Test lot description 2',
      starting_bid: 75
    }, insertOptions);

    const lotInsertResult3 = await lots.insertOne({
      _id: new ObjectId(),
      auction_id: auctionId,
      seller_email: sellerEmail,
      lot_number: 3,
      title: 'Test Lot 3',
      description: 'Test lot description 3',
      starting_bid: 100
    }, insertOptions);
    
    // Use the middle lot for deletion to test reordering
    testLotObjectId = lotInsertResult2.insertedId;

    await delay(350);
    return { testLotObjectId, auctionId, lotId, sellerEmail };
  }

  test('should return 204 when lot is successfully deleted and reorder remaining lots', async () => {
    await setupTestData();

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: testLotObjectId.toString(),
        auction_id: auctionId
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(204);

    // Verify lot was deleted from database
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const deletedLot = await lots.findOne({ _id: testLotObjectId });
    expect(deletedLot).toBeNull();

    // Verify remaining lots were reordered (lot 3 should now be lot 2)
    const remainingLots = await lots.find({ 
      auction_id: auctionId, 
      seller_email: sellerEmail 
    }).sort({ lot_number: 1 }).toArray();
    
    expect(remainingLots).toHaveLength(2);
    expect(remainingLots[0].lot_number).toBe(1);
    expect(remainingLots[1].lot_number).toBe(2); // This was originally lot 3

    // Verify counter was decremented
    const counters = db.collection(`${process.env.STAGE}-counters`);
    const counter = await counters.findOne({ 
      seller_email: sellerEmail, 
      auction_id: auctionId, 
      record_type: 'Lots' 
    });
    expect(counter.starting_sequence).toBe(2);
  });

  test('should return 400 when lot_id is missing', async () => {
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

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Lot ID and auction ID is required');
  });

  test('should return 400 when auction_id is missing', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: new ObjectId().toString()
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Lot ID and auction ID is required');
  });

  test('should return 400 when body is missing', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: null
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Lot ID and auction ID is required');
  });

  test('should return 403 when user is not authorized', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {}
        }
      },
      body: JSON.stringify({
        lot_id: new ObjectId().toString(),
        auction_id: 'TEST-AUCTION'
      })
    };

    const response = await delete_lot(event);
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
        lot_id: new ObjectId().toString(),
        auction_id: 'TEST-AUCTION'
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to perform this API action');
  });

  test('should return 404 when auction not found', async () => {
    const nonExistentAuctionId = `NON-EXISTENT-${Date.now()}`;
    
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: new ObjectId().toString(),
        auction_id: nonExistentAuctionId
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Auction not found');
  });

  test('should return 400 when auction is not in Draft status', async () => {
    // Create published auction
    const publishedAuctionId = `PUBLISHED-AUCTION-${Date.now()}`;
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    
    await auctions.insertOne({
      auction_id: publishedAuctionId,
      seller_email: sellerEmail,
      status: 'Published',
      auction_type: 'live'
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: new ObjectId().toString(),
        auction_id: publishedAuctionId
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Auction not in draft state');
  });

  test('should return 404 when lot not found', async () => {
    await setupTestData();
    // Use a valid ObjectId format but one that doesn't exist in the database
    const nonExistentLotId = new ObjectId('507f1f77bcf86cd799439011');
    
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: nonExistentLotId.toString(),
        auction_id: auctionId
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Lot not found');
  });

  test('should return 500 when lot_id is invalid ObjectId format', async () => {
    await setupTestData();
    
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: 'invalid-object-id',
        auction_id: auctionId
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBe('Internal Server Error');
  });

  test('should handle empty lot_id string', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: '',
        auction_id: auctionId
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Lot ID and auction ID is required');
  });

  test('should handle empty auction_id string', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: new ObjectId().toString(),
        auction_id: ''
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Lot ID and auction ID is required');
  });

  test('should return 403 when requestContext is missing', async () => {
    const event = {
      body: JSON.stringify({
        lot_id: new ObjectId().toString(),
        auction_id: 'TEST-AUCTION'
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to perform this API action');
  });

  test('should return 403 when authorizer is missing', async () => {
    const event = {
      requestContext: {},
      body: JSON.stringify({
        lot_id: new ObjectId().toString(),
        auction_id: 'TEST-AUCTION'
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('You do not have access to perform this API action');
  });

  test('should handle malformed JSON in body', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: '{ invalid json }'
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBe('Internal Server Error');
  });

  test('should successfully delete first lot and reorder remaining lots', async () => {
    await setupTestData();

    // Get the first lot
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const firstLot = await lots.findOne({ 
      auction_id: auctionId, 
      seller_email: sellerEmail,
      lot_number: 1 
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: firstLot._id.toString(),
        auction_id: auctionId
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(204);

    // Verify remaining lots were reordered correctly
    const remainingLots = await lots.find({ 
      auction_id: auctionId, 
      seller_email: sellerEmail 
    }).sort({ lot_number: 1 }).toArray();
    
    expect(remainingLots).toHaveLength(2);
    expect(remainingLots[0].lot_number).toBe(1); // Previously lot 2
    expect(remainingLots[1].lot_number).toBe(2); // Previously lot 3
  });

  test('should successfully delete last lot without affecting other lot numbers', async () => {
    await setupTestData();

    // Get the last lot
    const lots = db.collection(`${process.env.STAGE}-lots`);
    const lastLot = await lots.findOne({ 
      auction_id: auctionId, 
      seller_email: sellerEmail,
      lot_number: 3 
    });
    console.log("Last lot to delete",lastLot);

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: lastLot._id.toString(),
        auction_id: auctionId
      })
    };

    const response = await delete_lot(event);
    console.log("Response from delete",response);
    expect(response.statusCode).toBe(204);

    // Verify remaining lots maintained their numbers
    const remainingLots = await lots.find({ 
      auction_id: auctionId, 
      seller_email: sellerEmail 
    }).sort({ lot_number: 1 }).toArray();

    console.log("Remaining lots",remainingLots);
    
    expect(remainingLots).toHaveLength(2);
    expect(remainingLots[0].lot_number).toBe(1);
    expect(remainingLots[1].lot_number).toBe(2);
  });

  test('should handle auction belonging to different seller', async () => {
    const differentSellerEmail = 'different@seller.com';
    const differentAuctionId = `DIFF-AUCTION-${Date.now()}`;
    
    const auctions = db.collection(`${process.env.STAGE}-auctions`);
    await auctions.insertOne({
      auction_id: differentAuctionId,
      seller_email: differentSellerEmail,
      status: 'Draft',
      auction_type: 'live'
    });

    const event = {
      requestContext: {
        authorizer: {
          claims: { 'cognito:username': sellerEmail }
        }
      },
      body: JSON.stringify({
        lot_id: new ObjectId().toString(),
        auction_id: differentAuctionId
      })
    };

    const response = await delete_lot(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).message).toBe('Auction not found');
  });
});