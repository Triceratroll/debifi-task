// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { outputFolder: 'tests/playwright-report', open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    // Default headless (CI-friendly, faster). Use: npx playwright test --headed
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'off',
    // Optional: SLOW_MO=300 npx playwright test --headed
    launchOptions: process.env.SLOW_MO
      ? { slowMo: Number(process.env.SLOW_MO) || 300 }
      : {},
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
