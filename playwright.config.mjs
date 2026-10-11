import { defineConfig, devices } from '@playwright/test';

const isPwa = process.env.PLAYWRIGHT_PWA === '1';
const port = Number(process.env.PLAYWRIGHT_PORT || (isPwa ? 4173 : 3000));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PLAYWRIGHT_PORT');
const baseURL = `http://127.0.0.1:${port}`;
const viteCommand = 'node node_modules/vite/bin/vite.js';

export default defineConfig({
  testDir: './e2e',
  testMatch: isPwa ? '**/*.pwa.spec.js' : '**/*.spec.js',
  testIgnore: isPwa ? undefined : '**/*.pwa.spec.js',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['dot'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: isPwa ? 'allow' : 'block',
  },
  projects: [
    {
      name: isPwa ? 'pwa' : 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        serviceWorkers: isPwa ? 'allow' : 'block',
      },
    },
  ],
  webServer: {
    command: `${viteCommand} preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      VITE_API_BASE: '/api-v1/api.php',
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_AUTH_DOMAIN: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_STORAGE_BUCKET: '',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '',
      VITE_FIREBASE_APP_ID: '',
      VITE_FIREBASE_MEASUREMENT_ID: '',
      // Keep browser E2E deterministic even when the host shell has legacy variables.
      REACT_APP_API_BASE: '',
      REACT_APP_FIREBASE_API_KEY: '',
      REACT_APP_FIREBASE_AUTH_DOMAIN: '',
      REACT_APP_FIREBASE_PROJECT_ID: '',
      REACT_APP_FIREBASE_STORAGE_BUCKET: '',
      REACT_APP_FIREBASE_MESSAGING_SENDER_ID: '',
      REACT_APP_FIREBASE_APP_ID: '',
      REACT_APP_FIREBASE_MEASUREMENT_ID: '',
    },
    gracefulShutdown: {
      signal: 'SIGTERM',
      timeout: 5000,
    },
  },
});
