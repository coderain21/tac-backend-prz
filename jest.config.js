module.exports = {
    clearMocks: true,
    coverageDirectory: 'coverage',
    testEnvironment: 'node',
    testMatch: [
        '**/__tests__/**/*.js?(x)',
        '**/?(*.)+(spec|test).js?(x)',
    ],

    // This is a precise mapping for only the modules that fail to load.
    // The '$' at the end of each key ensures we match the exact path and not a partial one.
    moduleNameMapper: {
        '^../lib/helper$': '<rootDir>/lib/helper.js',
        '^../lib/mongodb_helper$': '<rootDir>/lib/mongodb_helper.js',
        '^../entities/BidInformation$': '<rootDir>/entities/BidInformation.js',
        '^../entities/Lot$': '<rootDir>/entities/Lot.js',
        '^../entities/Bid$': '<rootDir>/entities/Bid.js',
        '^../utilities/helper$': '<rootDir>/services/lot-bid-history/utilities/helper.js',
    },
}
