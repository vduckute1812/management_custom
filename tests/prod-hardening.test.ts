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
    expect(fetch).toContain("runner_login_home");
    expect(wf).toContain("secrets.DOPPLER_TOKEN");
    expect(wf).toContain("install-doppler-cli.sh");
    expect(wf).toContain("/home/");
    expect(wf).not.toContain("sync-doppler");
  });

  it("builds REDIS_URL with an encoded password for compose", () => {
    const lib = readFileSync(
      new URL("../docker/lib-compose.sh", import.meta.url),
      "utf8",
    );
    const compose = readFileSync(
      new URL("../docker/docker-compose.prod.yml", import.meta.url),
      "utf8",
    );
    expect(lib).toContain("urllib.parse.quote");
    expect(lib).toContain("export REDIS_URL");
    expect(compose).toContain('REDIS_URL: "${REDIS_URL}"');
    expect(compose).not.toContain("redis://:${REDIS_PASSWORD}@");
  });

  it("ci-deploy prunes dangling every run and lists app images filtered", () => {
    const deploy = readFileSync(
      new URL("../docker/ci-deploy.sh", import.meta.url),
      "utf8",
    );
    expect(deploy).toContain("prune_image_storage");
    expect(deploy).toContain("list_app_image_refs");
    expect(deploy).toContain('--filter "reference=${IMAGE}"');
    expect(deploy).toContain("remove_dangling_images");
    expect(deploy).toContain("APP_TAG_SOFT_MAX");
    // Must not walk the entire image store (hung Pi with ~164 tags).
    expect(deploy).not.toMatch(
      /podman images --format '\{\{\.Repository\}\}:\{\{\.Tag\}\}'/,
    );
    // Never wipe :previous via prune -a (comments may mention it as forbidden).
    expect(deploy).not.toMatch(/^\s*[^#\n]*image prune -a/m);
  });

  it("ships chat message created_at+id keyset index", () => {
    const sql = readFileSync(
      new URL(
        "../server/db/migrations/0037_chat_message_created_id_index.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("idx_chat_messages_conversation_created_id");
    expect(sql).toContain("created_at, id");
  });

  it("keeps account auth imports on ~/types/auth", () => {
    for (const rel of [
      "../composables/account/useAuth.ts",
      "../composables/account/authApi.ts",
      "../composables/account/authSessionStorage.ts",
      "../components/app/AppHeaderAccountMenu.vue",
    ]) {
      const src = readFileSync(new URL(rel, import.meta.url), "utf8");
      expect(src).not.toMatch(/from ["']~\/types\/task["']/);
      expect(src).toMatch(/from ["']~\/types\/auth["']/);
    }
  });

  it("ships friendship ACL updated_at indexes", () => {
    const sql = readFileSync(
      new URL(
        "../server/db/migrations/0036_friendship_acl_updated_indexes.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("idx_friendships_requester_status_updated_id");
    expect(sql).toContain("idx_friendships_addressee_status_updated_id");
    expect(sql).toContain("updated_at");
  });

  it("routes friends API through friendService", () => {
    const svc = readFileSync(
      new URL("../server/services/friends/friendService.ts", import.meta.url),
      "utf8",
    );
    expect(svc).toContain("requestFriendshipForUser");
    expect(svc).toContain("acceptFriendshipForUser");
    const accept = readFileSync(
      new URL("../server/api/friends/[id]/accept.post.ts", import.meta.url),
      "utf8",
    );
    expect(accept).toContain("acceptFriendshipForUser");
    expect(accept).not.toContain('from "~/server/utils/db"');
  });

  it("requires JWT_SECRET floor of 32 chars in auth primitives", () => {
    const auth = readFileSync(
      new URL("../server/utils/auth.ts", import.meta.url),
      "utf8",
    );
    expect(auth).toContain("raw.length < 32");
    expect(auth).toContain(">=32 chars");
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
    expect(sql).not.toMatch(/GRANT ALL/i);
    expect(sql).not.toMatch(/\bCREATE\b.*ON `rc`/i);

    const apply = readFileSync(
      new URL("../docker/apply-mysql-app-user.sh", import.meta.url),
      "utf8",
    );
    const verify = readFileSync(
      new URL("../docker/verify-mysql-app-user.sh", import.meta.url),
      "utf8",
    );
    expect(apply).toContain("CREATE USER IF NOT EXISTS");
    expect(apply).toContain("GRANT SELECT, INSERT, UPDATE, DELETE");
    expect(apply).toContain("CHANGE_ME");
    // Must not bash-source .env.prod (SMTP_FROM etc. break unquoted downloads).
    expect(apply).toContain("load_env_keys");
    expect(apply).not.toMatch(/\bsource\b.*\.env\.prod/);
    expect(verify).toContain("CREATE TABLE");
    expect(verify).toContain("ALLOW_ROOT_DB");
    expect(verify).toContain("load_env_keys");
  });

  it("downloads Doppler secrets in quoted env format", () => {
    const fetch = readFileSync(
      new URL("../docker/fetch-doppler-secrets.sh", import.meta.url),
      "utf8",
    );
    expect(fetch).toContain("--format env");
    expect(fetch).not.toContain("env-no-quotes");
  });

  it("runs boot migrations as root when MYSQL_ROOT_PASSWORD is set", () => {
    const entry = readFileSync(
      new URL("../docker/entrypoint.prod.sh", import.meta.url),
      "utf8",
    );
    expect(entry).toContain("scripts/migrate.ts up");
    const migrator = readFileSync(
      new URL("../server/db/core/migrator.ts", import.meta.url),
      "utf8",
    );
    expect(migrator).toContain("MYSQL_ROOT_PASSWORD");
    expect(migrator).toContain("migrateAuth");
    expect(migrator).toContain('user: "root"');
    // Status/verify must not CREATE as the DML-only app user.
    expect(migrator).toContain("ER_NO_SUCH_TABLE");
    expect(migrator).toMatch(
      /async function readApplied\([\s\S]*?ER_NO_SUCH_TABLE[\s\S]*?^}/m,
    );
  });

  it("runs CI migrate with MYSQL_ROOT_PASSWORD, not DB_USER=root", () => {
    const deploy = readFileSync(
      new URL("../docker/ci-deploy.sh", import.meta.url),
      "utf8",
    );
    expect(deploy).toContain("read_mysql_root_password");
    expect(deploy).toContain("MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}");
    // Forcing DB_USER=root trips getPool()'s production guard.
    expect(deploy).not.toMatch(/-e "DB_USER=root"/);
  });

  it("keeps LAN MySQL/Redis publishes for Podman DNS workaround", () => {
    expect(compose).toContain("127.0.0.1:3306:3306");
    expect(compose).toContain("${LAN_IP:-192.168.1.4}:3306:3306");
    expect(compose).toContain("127.0.0.1:6379:6379");
    expect(compose).toContain("${LAN_IP:-192.168.1.4}:6379:6379");
    expect(compose).toMatch(/host firewall/i);
  });

  it("ships a LAN firewall helper for MySQL/Redis ports", () => {
    const fw = readFileSync(
      new URL("../docker/configure-lan-firewall.sh", import.meta.url),
      "utf8",
    );
    expect(fw).toContain("ufw");
    expect(fw).toContain("3306");
    expect(fw).toContain("6379");
    expect(fw).toContain("APPLY");
    expect(fw).toContain("OpenSSH");
    expect(fw).toContain("delete deny 3306");
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
    const savingsGoals = readFileSync(
      new URL("../server/db/money/moneySavingsGoals.ts", import.meta.url),
      "utf8",
    );
    const savingsContrib = readFileSync(
      new URL(
        "../server/db/money/moneySavingsContributions.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const tasks = readFileSync(
      new URL("../server/db/time/tasksRead.ts", import.meta.url),
      "utf8",
    );
    const categories = readFileSync(
      new URL("../server/db/money/moneyUserCategories.ts", import.meta.url),
      "utf8",
    );
    expect(stories).toContain("STORIES_TRAY_MAX");
    expect(admin).toContain("ADMIN_USERS_SUMMARY_MAX");
    expect(savingsGoals).toContain("SAVINGS_GOALS_MAX");
    expect(savingsContrib).toContain("SAVINGS_CONTRIBUTIONS_PAGE_SIZE");
    expect(savingsContrib).toContain("nextCursor");
    expect(tasks).toContain("TASKS_UNSCOPED_MAX");
    expect(categories).toContain("MONEY_USER_CATEGORIES_MAX");
    const friends = readFileSync(
      new URL("../server/db/friends/friendshipCache.ts", import.meta.url),
      "utf8",
    );
    const storyInsights = readFileSync(
      new URL("../server/db/feed/storiesInsights.ts", import.meta.url),
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
