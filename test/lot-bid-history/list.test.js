/* eslint-disable no-undef */
const { handler } = require('../../services/lot-bid-history/handlers/list')

// Mock dependencies
jest.mock('../../lib/mongodb_helper')
jest.mock('../../services/lot-bid-history/utilities/helper')
const mongodbHelper = require('../../lib/mongodb_helper')
const helper = require('../../services/lot-bid-history/utilities/helper')

describe('List Bids Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should return a 200 OK with a list of bids on success', async () => {
        // --- Arrange (Setup) ---

        // 1. Use the realistic data
        const mockBidData = {
            _id: '65b0a7e537f3b13f4a2d2261',
            name: 'First Bidder',
            bid_amount: 1300,
            paddle_number: 1,
            // Add any other fields we want
        }

        const mockBidsList = {
            docs: [mockBidData], // Use the actual realistic data
            totalPages: 1,
            limit: 10,
            totalDocs: 1,
            nextPage: null,
            page: 1,
        }

        // Mock the database calls to return our realistic data
        mongodbHelper.connect.mockResolvedValue({ disconnect: jest.fn() })
        mongodbHelper.view.mockResolvedValue([{ _id: 'lot1', current_bid: 1300, top_bidder: 'First Bidder' }])
        mongodbHelper.list.mockResolvedValue(mockBidsList)

        // Simulate the under_bidder being empty for this test case
        helper.getLowestBidder.mockResolvedValue([mockBidData])

        // 2. Create a sample API Gateway event
        const event = {
            pathParameters: {
                lot_id: '65b0a6aec861cdbda92c38d0', // Use a realistic lot_id
            },
            queryStringParameters: {
                page: '1',
                limit: '10',
            },
        }

        // --- Act (Execution) ---
        const response = await handler(event)

        // --- Assert (Verification) ---
        expect(response.statusCode).toBe(200)
        const body = JSON.parse(response.body)

        expect(body.data).toHaveLength(1)
        expect(body.data[0].name).toBe('First Bidder')
        expect(body.pagination.total_records).toBe(1)
        expect(body.pagination.top_bid).toBe(1300)
        // Check that under_bidder is an empty object as per the handler's logic
        expect(body.pagination.under_bidder).toEqual({})
    })

    // add more tests here (e.g., for 404 Not Found)
})
