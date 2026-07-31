/**
 * In-process ring buffer of recent console / Nitro log lines for the
 * superadmin system monitor. Captures this container's stdout-equivalent
 * messages only — sibling containers (mysql/redis/nginx) are not visible
 * without host privileges.
 */

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface LogEntry {
  at: string;
  level: LogLevel;
  message: string;
}

const MAX_ENTRIES = 300;
const MAX_MESSAGE_CHARS = 2000;

const buffer: LogEntry[] = [];
let installed = false;

function push(level: LogLevel, args: unknown[]) {
  const message = args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ")
    .slice(0, MAX_MESSAGE_CHARS);

  buffer.push({
    at: new Date().toISOString(),
    level,
    message,
  });
  while (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function installLogBuffer() {
  if (installed || !import.meta.server) return;
  installed = true;

  const levels: LogLevel[] = ["log", "info", "warn", "error", "debug"];
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        push(level, args);
      } catch {
        // never break logging
      }
      original(...args);
    };
  }
}

export function getRecentLogs(opts?: {
  limit?: number;
  level?: LogLevel | "all";
}): LogEntry[] {
  const limit = Math.min(MAX_ENTRIES, Math.max(1, opts?.limit ?? 100));
  const level = opts?.level ?? "all";
  const filtered =
    level === "all" ? buffer : buffer.filter((e) => e.level === level);
  return filtered.slice(-limit);
}
