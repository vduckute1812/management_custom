import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 3000);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

/**
 * Public-route smoke tests. CI builds the Nitro output first, then Playwright
 * starts `.output/server` with a throwaway MySQL (see `.github/workflows/ci.yml`).
 *
 * Locally: `npm run build && npm run test:e2e` (MySQL + JWT_SECRET required),
 * or point `E2E_BASE_URL` at an already-running install and skip webServer.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "node .output/server/index.mjs",
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(port),
          NITRO_HOST: "127.0.0.1",
          NITRO_PORT: String(port),
          NODE_ENV: "production",
          COOKIE_SECURE: "false",
        },
      },
});
