import { defineConfig } from '@playwright/test';

export default defineConfig({
  // The directory where tests are located
  testDir: './test',

  // Timeout for each test in milliseconds
  timeout: 30 * 1000,

  // Reporter to use. See https://playwright.dev/docs/test-reporters
  reporter: 'html',

  use: {
    // Base URL to use in actions like `await page.goto('/')`
    // Since we are doing API testing, this is less relevant but good to have.
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
    trace: 'on-first-retry',
  },
});
