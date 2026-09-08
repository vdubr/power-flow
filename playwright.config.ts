import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a real build served by Vite preview, so they
 * exercise the same bundle users get. The unit suite covers logic; these cover
 * the things only a browser can show: drag & drop, brushing the chart, touch
 * targets and the accessibility tree.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // The app formats dates and numbers for Czech users.
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
