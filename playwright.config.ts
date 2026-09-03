import { defineConfig } from '@playwright/test';

const defaultBaseUrl =
  'https://taotlus.bigbank.ee/?amount=5000&period=60&productName=SMALL_LOAN&loanPurpose=DAILY_SETTLEMENTS';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? defaultBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  expect: {
    timeout: 10_000
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium'
      }
    }
  ]
});
