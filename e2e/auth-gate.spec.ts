import { expect, test } from "@playwright/test";

/**
 * Auth gate smoke — no seeded user required. Verifies protected routes bounce
 * to login and session APIs reject anonymous callers.
 */
test.describe("auth gate smoke", () => {
  test("money redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/money");
    await expect(page).toHaveURL(/\/login/);
    expect(new URL(page.url()).searchParams.get("redirect")).toMatch(/\/money/);
    await expect(
      page.locator('input[type="email"], input[name="email"]').first(),
    ).toBeVisible();
  });

  test("chat redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login/);
    expect(new URL(page.url()).searchParams.get("redirect")).toMatch(/\/chat/);
  });

  test("friends redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/friends");
    await expect(page).toHaveURL(/\/login/);
    expect(new URL(page.url()).searchParams.get("redirect")).toMatch(
      /\/friends/,
    );
  });

  test("GET /api/auth/me is 401 without a session", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });

  test("login rejects empty credentials with 400", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { email: "", password: "" },
    });
    expect(res.status()).toBe(400);
  });
});
