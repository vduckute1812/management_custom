import { cpus, freemem, loadavg, totalmem, type } from "node:os";
import { hrtime } from "node:process";
import { statfs } from "node:fs/promises";
import { getPool } from "~/server/db/pool";
import { migrationStatus } from "~/server/db/migrator";
import { countJobsByStatus } from "~/server/db/jobs";
import { cacheDriverName } from "~/server/utils/cache";
import type { SystemSnapshot } from "~/types/system";

const CPU_SAMPLE_MS = 120;

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

async function measureHttpLatency(): Promise<{
  ok: boolean;
  ms: number | null;
  status: number | null;
}> {
  const port = (
    process.env.APP_PORT ||
    process.env.NITRO_PORT ||
    process.env.PORT ||
    "3000"
  ).trim();
  const url = `http://127.0.0.1:${port}/api/health`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });
    return { ok: res.ok, ms: Date.now() - t0, status: res.status };
  } catch {
    return { ok: false, ms: Date.now() - t0, status: null };
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
  const percent =
    elapsedUs > 0 ? Math.min(100 * cores, (cpuUs / elapsedUs) * 100) : 0;
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
 * Superadmin ops snapshot: process RAM/CPU, container disk/memory, DB/HTTP
 * latency, cache driver, and job queue depths.
 *
 * Values from `os.*` / `statfs('/')` reflect the process cgroup when running
 * inside the app container — not necessarily the full Pi host.
 */
export async function collectSystemSnapshot(): Promise<SystemSnapshot> {
  const collectedAt = new Date().toISOString();
  const mem = process.memoryUsage();

  const [db, http, cpu, diskRoot, cacheDriver, jobs, migrations] =
    await Promise.all([
      measureDbLatency(),
      measureHttpLatency(),
      measureCpuPercent(),
      readDisk("/"),
      cacheDriverName(),
      countJobsByStatus(),
      migrationStatus().catch(() => null),
    ]);

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
      db: db,
      http: http,
    },
    health: {
      db: db.ok,
      migrations: {
        ok: migrations
          ? migrations.pending.length === 0 && migrations.drift.length === 0
          : false,
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
