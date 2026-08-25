import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  retries: 2,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
  },
  webServer: [
    {
      command: 'pnpm --filter @kithlink/server exec tsx src/main.api.ts',
      port: 4000,
      reuseExistingServer: process.env.E2E_REUSE === '1',
      timeout: 60_000,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
        KITHLINK_MASTER_KEY: process.env.KITHLINK_MASTER_KEY ?? '',
        API_PORT: '4000',
        APP_URL: 'http://127.0.0.1:3000',
        ADMIN_URL: 'http://127.0.0.1:3001',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'pnpm --filter @kithlink/web dev -p 3000',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @kithlink/admin dev -p 3001',
      url: 'http://127.0.0.1:3001',
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
