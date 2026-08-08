import { expect, test } from "@playwright/test";

test.describe("public smoke", () => {
  test("health is ready", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
  });

  test("hub renders header + login CTA", async ({ page }) => {
    await page.goto("/");
    // App chrome uses role=banner; pages may also have a content <header>.
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /login|đăng nhập|登录/i }),
    ).toBeVisible();
  });

  test("feed page loads", async ({ page }) => {
    await page.goto("/feed");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("privacy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("login form is reachable", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.locator('input[type="email"], input[name="email"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('input[type="password"], input[name="password"]').first(),
    ).toBeVisible();
  });
});
