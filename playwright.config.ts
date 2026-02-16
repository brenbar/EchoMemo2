import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chromium'] },
      testIgnore: /webkit-audio-smoke\.spec\.ts/,
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: /webkit-audio-smoke\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'GITHUB_PAGES_BASE=/ npm run dev -- --host --port 4173',
    port: 4173,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
