#!/usr/bin/env node
/**
 * Pre-commit secret scanner.
 *
 * Blocks commits that contain credentials — either whole files that should
 * never be tracked (`.env`, private keys, keystores) or secret-looking values
 * inside otherwise legitimate files.
 *
 * Deliberately dependency-free so it runs from a bare `git commit` on the
 * deploy Pi without needing an extra binary (gitleaks, trufflehog) on PATH.
 *
 * Usage:
 *   node scripts/scan-secrets.mjs --staged   # what `git commit` would record
 *   node scripts/scan-secrets.mjs --all      # every tracked file
 *   node scripts/scan-secrets.mjs a.ts b.ts  # specific files, from disk
 *
 * Escape hatches for false positives:
 *   - append `secret-scan:ignore` in a comment on the offending line
 *   - add a path glob to `.secretsignore`
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const ALLOW_PRAGMA =
  /secret-scan:ignore|pragma:\s*allowlist secret|gitleaks:allow/i;

/**
 * Paths never worth scanning: generated, vendored, or binary. Keeping these
 * out is what makes the scan fast enough for a pre-commit hook.
 */
const SKIP_PATHS = [
  /(^|\/)node_modules\//,
  /(^|\/)\.(git|nuxt|output|nitro|cache|data|venv)\//,
  /(^|\/)dist\//,
  /(^|\/)package-lock\.json$/,
  /(^|\/)uv\.lock$/,
  /\.min\.(js|css)$/,
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|docx|woff2?|ttf|eot|zip|gz|tgz|mp4|webm)$/i,
];

/**
 * Files that must never be committed at all, regardless of contents.
 * `.env.example` and friends are the intentional, value-free exceptions.
 */
const BLOCKED_PATHS = [
  {
    test: (p) =>
      /(^|\/)\.env($|\.)/.test(p) &&
      !/\.(example|sample|template|dist)$/.test(p),
    reason: "Environment files hold real credentials — keep them untracked",
  },
  {
    test: (p) => /\.(pem|key|p12|pfx|jks|keystore|ppk)$/i.test(p),
    reason: "Private key / keystore file",
  },
  {
    test: (p) => /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/.test(p),
    reason: "SSH private key",
  },
  {
    test: (p) => /(^|\/)(credentials|service-account.*)\.json$/i.test(p),
    reason: "Cloud service-account credentials",
  },
  {
    test: (p) => /(^|\/)\.npmrc$/.test(p),
    reason: ".npmrc usually carries a registry auth token",
  },
];

/**
 * `high` rules match formats that are secrets by construction, so they fire
 * unconditionally. `generic` rules match "looks like an assignment of
 * something sensitive" and are additionally filtered by placeholder and
 * entropy checks, which is where the false positives would otherwise come from.
 */
const RULES = [
  {
    id: "private-key",
    confidence: "high",
    description: "Private key block",
    regex:
      /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE KEY-----/g,
  },
  {
    id: "aws-access-key-id",
    confidence: "high",
    description: "AWS access key ID",
    regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
  },
  {
    id: "github-token",
    confidence: "high",
    description: "GitHub token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{22,}\b/g,
  },
  {
    id: "slack-token",
    confidence: "high",
    description: "Slack token",
    regex: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: "slack-webhook",
    confidence: "high",
    description: "Slack incoming webhook",
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/+]{20,}/g,
  },
  {
    id: "stripe-key",
    confidence: "high",
    description: "Stripe secret key",
    regex: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    id: "google-api-key",
    confidence: "high",
    description: "Google API key",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: "llm-api-key",
    confidence: "high",
    description: "OpenAI / Anthropic API key",
    regex: /\bsk-(?:proj-|ant-)[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: "npm-token",
    confidence: "high",
    description: "npm access token",
    regex: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: "jwt",
    confidence: "high",
    description: "JSON Web Token",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    id: "connection-string-password",
    confidence: "high",
    description: "Connection string with inline password",
    regex:
      /\b(?:mysql|postgres|postgresql|mongodb|mongodb\+srv|redis|rediss|amqp|ftp):\/\/[^\s:/@]+:(?<value>[^\s:/@]{3,})@/g,
  },
  {
    id: "basic-auth-header",
    confidence: "generic",
    description: "Hardcoded Authorization header",
    regex:
      /\bAuthorization["'\s]*[:=]\s*["'](?:Basic|Bearer)\s+(?<value>[A-Za-z0-9+/=._-]{12,})["']/gi,
  },
  {
    id: "secret-assignment",
    confidence: "generic",
    description: "Hardcoded credential assignment",
    regex:
      /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token|credentials?)\b["'\s]*[:=]\s*["'](?<value>[^"'\n]{8,})["']/gi,
  },
  {
    id: "env-secret-assignment",
    confidence: "generic",
    description: "Secret assigned in env-style file",
    regex:
      /^\s*(?:export\s+)?[A-Z0-9_]*(?:PASS|PASSWORD|SECRET|TOKEN|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*\s*=\s*(?<value>\S{8,})\s*$/gm,
  },
];

/** Substrings that mark a value as an obvious stand-in rather than a secret. */
const PLACEHOLDER_HINTS = [
  "changeme",
  "change-me",
  "change_me",
  "replaceme",
  "replace-me",
  "replace_me",
  "placeholder",
  "your-",
  "your_",
  "yourpassword",
  "example",
  "sample",
  "dummy",
  "redacted",
  "todo",
  "fixme",
  "notasecret",
  "not-a-secret",
  "fake",
  "hunter2",
  "password",
  "secret",
  "s3cr3t",
  "123456",
  "abcdef",
  "foobar",
  "lorem",
  "test",
];

function looksLikePlaceholder(value) {
  const v = value.trim();
  if (!v) return true;
  // Interpolations and env reads never contain the literal secret.
  if (/\$\{|\$\(|<%|%s|\{\{/.test(v)) return true;
  if (/^(?:process\.env|import\.meta\.env|os\.environ|ENV)\b/.test(v))
    return true;
  if (/^<.*>$/.test(v)) return true;
  if (/^[.*x_\-\s0]+$/i.test(v)) return true;
  // A single repeated character, e.g. "aaaaaaaa".
  if (/^(.)\1+$/.test(v)) return true;
  const lower = v.toLowerCase();
  return PLACEHOLDER_HINTS.some((hint) => lower.includes(hint));
}

/** Shannon entropy in bits per character. */
function entropy(value) {
  const counts = new Map();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * Generic rules only fire on values that also look random. Long, mixed-charset
 * strings are the signature of a real credential; prose and identifiers are not.
 */
function looksRandom(value) {
  const v = value.trim();
  if (v.length < 12) return false;
  if (/\s/.test(v)) return false;
  if (!/[0-9]/.test(v) && !/[A-Z]/.test(v)) return false;
  return entropy(v) >= 3.2;
}

function mask(value) {
  const v = value.trim();
  if (v.length <= 8) return "*".repeat(v.length);
  return `${v.slice(0, 3)}${"*".repeat(Math.min(v.length - 6, 20))}${v.slice(-3)}`;
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function loadIgnorePatterns() {
  if (!existsSync(".secretsignore")) return [];
  return readFileSync(".secretsignore", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((glob) => {
      const source = glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\u0000/g, ".*")
        .replace(/\?/g, ".");
      return new RegExp(`^${source}$`);
    });
}

function stagedPaths() {
  const out = git([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
  ]).toString("utf8");
  return out.split("\0").filter(Boolean);
}

function trackedPaths() {
  return git(["ls-files", "-z"]).toString("utf8").split("\0").filter(Boolean);
}

/** Read the exact bytes the commit would record, not the working copy. */
function readStaged(path) {
  try {
    return git(["show", `:${path}`]);
  } catch {
    return null;
  }
}

function readWorking(path) {
  try {
    if (!existsSync(path) || statSync(path).isDirectory()) return null;
    return readFileSync(path);
  } catch {
    return null;
  }
}

function scanContent(path, text) {
  const findings = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  const lineAt = (index) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(text)) !== null) {
      if (match[0] === "") {
        rule.regex.lastIndex++;
        continue;
      }
      const lineIndex = lineAt(match.index);
      const lineText = text.slice(
        lineStarts[lineIndex],
        lineStarts[lineIndex + 1] ?? text.length,
      );
      if (ALLOW_PRAGMA.test(lineText)) continue;

      const value = match.groups?.value ?? match[0];
      if (rule.confidence === "generic") {
        if (looksLikePlaceholder(value)) continue;
        if (!looksRandom(value)) continue;
      }

      findings.push({
        path,
        line: lineIndex + 1,
        rule: rule.id,
        description: rule.description,
        preview: mask(value),
      });
    }
  }
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const staged = args.includes("--staged");
  const all = args.includes("--all");
  const explicit = args.filter((a) => !a.startsWith("--"));

  const paths = staged
    ? stagedPaths()
    : all
      ? trackedPaths()
      : explicit.length
        ? explicit
        : stagedPaths();

  const ignorePatterns = loadIgnorePatterns();
  const findings = [];
  const blocked = [];

  for (const path of paths) {
    if (SKIP_PATHS.some((re) => re.test(path))) continue;
    if (ignorePatterns.some((re) => re.test(path))) continue;

    const rule = BLOCKED_PATHS.find((b) => b.test(path));
    if (rule) {
      blocked.push({ path, reason: rule.reason });
      continue;
    }

    const buf = staged ? readStaged(path) : readWorking(path);
    if (!buf || buf.length === 0 || buf.length > MAX_SCAN_BYTES) continue;
    // NUL means binary; there is nothing useful to grep for.
    if (buf.subarray(0, 8000).includes(0)) continue;

    findings.push(...scanContent(path, buf.toString("utf8")));
  }

  if (!blocked.length && !findings.length) {
    return 0;
  }

  console.error("\n\u2716 Secret scan failed — commit blocked.\n");

  for (const { path, reason } of blocked) {
    console.error(`  ${path}`);
    console.error(`      must not be committed: ${reason}\n`);
  }

  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.path)) byFile.set(f.path, []);
    byFile.get(f.path).push(f);
  }
  for (const [path, items] of byFile) {
    for (const f of items) {
      console.error(`  ${path}:${f.line}  [${f.rule}]`);
      console.error(`      ${f.description}: ${f.preview}\n`);
    }
  }

  const total = blocked.length + findings.length;
  console.error(
    `${total} issue${total === 1 ? "" : "s"} across ${
      blocked.length + byFile.size
    } file(s).\n`,
  );
  console.error("If a real credential was committed earlier, rotate it now.");
  console.error("If this is a false positive, either:");
  console.error("  • add `secret-scan:ignore` in a comment on that line, or");
  console.error("  • add a path glob to .secretsignore\n");
  return 1;
}

process.exit(main());
