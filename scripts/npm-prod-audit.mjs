#!/usr/bin/env node
/**
 * Production dependency audit for CI.
 *
 * Runs `npm audit --omit=dev --audit-level=high` and fails on any high/critical
 * finding that is not explicitly allowlisted below. Allowlist entries must cite
 * why we cannot bump yet (upstream archived / no patched release).
 */
import { execFileSync } from "node:child_process";

/** Advisory IDs with no patched release we can force via overrides today. */
const ALLOWED_HIGH = new Map([
  [
    "GHSA-w3rx-r6r6-pgpr",
    "image-size ≤2.0.2 ICNS DoS — package archived, pulled only via @nuxtjs/seo → nuxt-seo-utils (OG sizing). No patched release.",
  ],
  [
    "GHSA-5p2g-fcmc-qvqq",
    "image-size ≤2.0.2 JXL/HEIF DoS — same transitive as above; no patched release.",
  ],
]);

let report;
try {
  execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.info("[audit] no production vulnerabilities reported");
  process.exit(0);
} catch (err) {
  const stdout =
    err && typeof err === "object" && "stdout" in err ? err.stdout : "";
  try {
    report = JSON.parse(String(stdout || "{}"));
  } catch {
    console.error("[audit] failed to parse npm audit JSON");
    console.error(String(stdout || err));
    process.exit(1);
  }
}

const vulns = report?.vulnerabilities ?? {};
const blockers = [];
const allowed = [];

for (const [name, entry] of Object.entries(vulns)) {
  const via = Array.isArray(entry?.via) ? entry.via : [];
  for (const item of via) {
    if (typeof item !== "object" || item == null) continue;
    const severity = String(item.severity || entry.severity || "");
    if (severity !== "high" && severity !== "critical") continue;
    const id = String(item.url || item.source || item.title || "")
      .split("/")
      .pop();
    const ghsa = id?.startsWith("GHSA-")
      ? id
      : String(item.url || "").match(/GHSA-[a-z0-9-]+/)?.[0];
    if (ghsa && ALLOWED_HIGH.has(ghsa)) {
      allowed.push({ name, ghsa, reason: ALLOWED_HIGH.get(ghsa) });
      continue;
    }
    blockers.push({
      name,
      severity,
      title: item.title,
      url: item.url,
      ghsa,
    });
  }
}

if (allowed.length) {
  console.warn(
    "[audit] allowlisted high findings (documented, no upstream fix):",
  );
  for (const row of allowed) {
    console.warn(`  - ${row.name}: ${row.ghsa} — ${row.reason}`);
  }
}

if (blockers.length) {
  console.error("[audit] blocking production vulnerabilities:");
  for (const row of blockers) {
    console.error(
      `  - ${row.name} (${row.severity}): ${row.title || row.ghsa || "?"} ${row.url || ""}`,
    );
  }
  process.exit(1);
}

console.info(
  "[audit] production audit passed (allowlist only for documented image-size GHSAs)",
);
process.exit(0);
