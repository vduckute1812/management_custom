/** Superadmin system monitor payload (`GET /api/admin/system`). */
export interface SystemSnapshot {
  collectedAt: string;
  /** `container` when metrics reflect the app cgroup, not necessarily the host. */
  scope: "container";
  process: {
    pid: number;
    nodeVersion: string;
    uptimeMs: number;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
    };
    cpu: {
      percent: number;
      sampleMs: number;
      cores: number;
    };
  };
  host: {
    platform: string;
    arch: string;
    loadAverage: number[];
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    };
    disk: {
      path: string;
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    } | null;
  };
  latency: {
    db: { ok: boolean; ms: number | null };
    http: { ok: boolean; ms: number | null; status: number | null };
  };
  health: {
    db: boolean;
    migrations: {
      ok: boolean;
      pending: number | null;
      drift: number | null;
    };
  };
  cache: {
    driver: string;
    redisConfigured: boolean;
  };
  queue: {
    workerEnabled: boolean;
    jobs: {
      pending: number;
      processing: number;
      completed: number;
      dead: number;
    };
  };
}
