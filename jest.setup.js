// Jest setup file
// This file runs before each test file

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test configuration
global.TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Console logging during tests
if (process.env.JEST_VERBOSE === 'true') {
    global.console = {
        ...console,
        log: jest.fn((...args) => {
            process.stdout.write(`[TEST LOG] ${args.join(' ')}\n`);
        }),
        warn: jest.fn((...args) => {
            process.stderr.write(`[TEST WARN] ${args.join(' ')}\n`);
        }),
        error: jest.fn((...args) => {
            process.stderr.write(`[TEST ERROR] ${args.join(' ')}\n`);
        })
    };
}

// Global test helpers
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Setup test environment
beforeAll(() => {
    console.log('🧪 Starting test suite...');
    console.log(`📍 Testing server at: ${global.TEST_BASE_URL}`);
});

afterAll(() => {
    console.log('✅ Test suite completed');
});