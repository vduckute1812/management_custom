import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Lightweight invariant checks so quality regressions in prod hardening
 * are caught without needing a full Docker stack.
 */
describe("production hardening invariants", () => {
  const compose = readFileSync(
    new URL("../docker/docker-compose.prod.yml", import.meta.url),
    "utf8",
  );
  const csp = readFileSync(
    new URL("../server/utils/content-security-policy.ts", import.meta.url),
    "utf8",
  );
  const pool = readFileSync(
    new URL("../server/db/core/pool.ts", import.meta.url),
    "utf8",
  );
  const ci = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  it("does not ship a default Redis password of changeme", () => {
    expect(compose).not.toContain("changeme");
    expect(compose).toContain("REDIS_PASSWORD:?");
  });

  it("requires Redis password from Doppler (no local auto-mint)", () => {
    const lib = readFileSync(
      new URL("../docker/lib-compose.sh", import.meta.url),
      "utf8",
    );
    const fetch = readFileSync(
      new URL("../docker/fetch-doppler-secrets.sh", import.meta.url),
      "utf8",
    );
    expect(lib).not.toContain("mgmt_ensure_redis_password");
    expect(lib).not.toContain("mgmt_ensure_allow_root_db");
    expect(fetch).toContain("REDIS_PASSWORD");
    expect(fetch).toContain("REQUIRED_KEYS");
    expect(fetch).toContain("required secret(s) missing");
  });

  it("uses Doppler-only env secrets (no upload sync / no local fallback)", () => {
    const link = readFileSync(
      new URL("../docker/link-secrets.sh", import.meta.url),
      "utf8",
    );
    const fetch = readFileSync(
      new URL("../docker/fetch-doppler-secrets.sh", import.meta.url),
      "utf8",
    );
    const wf = readFileSync(
      new URL("../.github/workflows/deploy-pi.yml", import.meta.url),
      "utf8",
    );
    expect(link).toContain("fetch-doppler-secrets.sh");
    expect(link).toContain("Doppler secrets required");
    expect(fetch).toContain("secrets download");
    expect(fetch).toContain("DOPPLER_TOKEN");
    expect(wf).toContain("secrets.DOPPLER_TOKEN");
    expect(wf).toContain("install-doppler-cli.sh");
    expect(wf).not.toContain("sync-doppler");
  });

  it("does not force ALLOW_ROOT_DB=1 in compose", () => {
    expect(compose).not.toMatch(/ALLOW_ROOT_DB:\s*"1"/);
  });

  it("refuses production root DB unless explicitly overridden", () => {
    expect(pool).toContain("ALLOW_ROOT_DB");
    expect(pool).toContain("Refusing to start with DB_USER=root");
  });

  it("keeps connect-src narrow in CSP", () => {
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/connect-src 'self' https:(;|$)/);
  });

  it("does not allow script unsafe-inline in CSP builders", () => {
    expect(csp).not.toMatch(/script-src[^;\n]*'unsafe-inline'/);
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("buildDocumentContentSecurityPolicy");
  });

  it("ships a MySQL app-user cutover script", () => {
    const sql = readFileSync(
      new URL("../docker/mysql-create-app-user.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE USER IF NOT EXISTS 'mgmt'");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON `rc`.*");
  });

  it("caps unbounded admin/story list queries", () => {
    const stories = readFileSync(
      new URL("../server/db/feed/storiesRead.ts", import.meta.url),
      "utf8",
    );
    const admin = readFileSync(
      new URL("../server/db/admin/admin.ts", import.meta.url),
      "utf8",
    );
    const savings = readFileSync(
      new URL("../server/db/money/moneySavings.ts", import.meta.url),
      "utf8",
    );
    const tasks = readFileSync(
      new URL("../server/db/time/tasks.ts", import.meta.url),
      "utf8",
    );
    const categories = readFileSync(
      new URL("../server/db/money/moneyUserCategories.ts", import.meta.url),
      "utf8",
    );
    expect(stories).toContain("STORIES_TRAY_MAX");
    expect(admin).toContain("ADMIN_USERS_SUMMARY_MAX");
    expect(savings).toContain("SAVINGS_CONTRIBUTIONS_PAGE_SIZE");
    expect(savings).toContain("SAVINGS_GOALS_MAX");
    expect(savings).toContain("nextCursor");
    expect(tasks).toContain("TASKS_UNSCOPED_MAX");
    expect(categories).toContain("MONEY_USER_CATEGORIES_MAX");
    const friends = readFileSync(
      new URL("../server/db/friends/friendships.ts", import.meta.url),
      "utf8",
    );
    const storyInsights = readFileSync(
      new URL("../server/db/feed/stories.ts", import.meta.url),
      "utf8",
    );
    expect(friends).toContain("ACCEPTED_FRIEND_IDS_MAX");
    expect(storyInsights).toContain("STORY_INSIGHTS_LIST_MAX");
  });

  it("runs lint and dependency audit in CI", () => {
    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm-prod-audit.mjs");
  });
});
