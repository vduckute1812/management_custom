import { cpus, freemem, loadavg, totalmem, type } from "node:os";
import { hrtime } from "node:process";
import { statfs } from "node:fs/promises";
import { getPool } from "~/server/db/core/pool";
import { migrationStatus } from "~/server/db/core/migrator";
import { countJobsByStatus } from "~/server/db/core/jobs";
import { cacheDriverName } from "~/server/utils/cache";
import type { SystemSnapshot } from "~/types/system";

const CPU_SAMPLE_MS = 80;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measureDbLatency(): Promise<{
  ok: boolean;
  ms: number | null;
}> {
  const t0 = Date.now();
  try {
    await getPool().query("SELECT 1");
    return { ok: true, ms: Date.now() - t0 };
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

/**
 * Redis PING latency. Returns null when REDIS_URL is unset.
 * Uses a short-lived connection so we do not share state with the cache driver.
 */
async function measureRedisLatency(): Promise<{
  ok: boolean;
  ms: number | null;
} | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  const t0 = Date.now();
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: 1500,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      await client.ping();
      return { ok: true, ms: Date.now() - t0 };
    } finally {
      client.disconnect();
    }
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

async function measureCpuPercent(): Promise<{
  percent: number;
  sampleMs: number;
  cores: number;
}> {
  const cores = Math.max(1, cpus().length || 1);
  const t0 = hrtime.bigint();
  const usage0 = process.cpuUsage();
  await sleep(CPU_SAMPLE_MS);
  const usage = process.cpuUsage(usage0);
  const elapsedUs = Number(hrtime.bigint() - t0) / 1000;
  const cpuUs = usage.user + usage.system;
  // Normalize to 0–100 across all cores for a clearer gauge.
  const percent =
    elapsedUs > 0 ? Math.min(100, (cpuUs / elapsedUs / cores) * 100) : 0;
  return {
    percent: Math.round(percent * 10) / 10,
    sampleMs: CPU_SAMPLE_MS,
    cores,
  };
}

async function readDisk(path: string): Promise<{
  path: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
} | null> {
  try {
    const s = await statfs(path);
    const totalBytes = Number(s.bsize) * Number(s.blocks);
    const freeBytes = Number(s.bsize) * Number(s.bavail);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent =
      totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
    return { path, totalBytes, freeBytes, usedBytes, usedPercent };
  } catch {
    return null;
  }
}

/**
 * Superadmin ops snapshot: process RAM/CPU, container disk/memory, DB/Redis
 * latency, cache driver, and job queue depths.
 *
 * Values from `os.*` / `statfs('/')` reflect the process cgroup when running
 * inside the app container — not necessarily the full Pi host.
 *
 * Health latency is an inline readiness probe (DB + migrations), not a
 * self-HTTP fetch — localhost round-trips were hanging under Podman/undici.
 */
export async function collectSystemSnapshot(): Promise<SystemSnapshot> {
  const collectedAt = new Date().toISOString();
  const mem = process.memoryUsage();

  const healthStarted = Date.now();
  const [db, redis, cpu, diskRoot, cacheDriver, jobs, migrations] =
    await Promise.all([
      measureDbLatency(),
      measureRedisLatency(),
      measureCpuPercent(),
      readDisk("/"),
      cacheDriverName(),
      countJobsByStatus(),
      migrationStatus().catch(() => null),
    ]);
  const migrationsOk = migrations
    ? migrations.pending.length === 0 && migrations.drift.length === 0
    : false;
  const healthOk = db.ok && migrationsOk;
  const health = {
    ok: healthOk,
    ms: Date.now() - healthStarted,
    status: healthOk ? 200 : 503,
  };

  const totalMem = totalmem();
  const freeMem = freemem();
  const usedMem = Math.max(0, totalMem - freeMem);

  return {
    collectedAt,
    scope: "container" as const,
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      uptimeMs: Math.round(process.uptime() * 1000),
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
        externalBytes: mem.external,
      },
      cpu,
    },
    host: {
      platform: type(),
      arch: process.arch,
      loadAverage: loadavg().map((n) => Math.round(n * 100) / 100),
      memory: {
        totalBytes: totalMem,
        freeBytes: freeMem,
        usedBytes: usedMem,
        usedPercent:
          totalMem > 0 ? Math.round((usedMem / totalMem) * 1000) / 10 : 0,
      },
      disk: diskRoot,
    },
    latency: {
      db,
      http: health,
      redis,
    },
    health: {
      db: db.ok,
      migrations: {
        ok: migrationsOk,
        pending: migrations?.pending.length ?? null,
        drift: migrations?.drift.length ?? null,
      },
    },
    cache: {
      driver: cacheDriver,
      redisConfigured: Boolean(process.env.REDIS_URL?.trim()),
    },
    queue: {
      workerEnabled: !["0", "false", "no", "off"].includes(
        (process.env.QUEUE_WORKER_ENABLED || "true").trim().toLowerCase(),
      ),
      jobs,
    },
  };
}
