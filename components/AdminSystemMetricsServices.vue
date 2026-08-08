<script setup lang="ts">
import type { SystemSnapshot } from "~/types/system";

defineProps<{
  snapshot: SystemSnapshot;
}>();
</script>

<template>
  <div
    class="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-3 text-xs text-slate-600"
  >
    <h3 class="text-xs font-semibold text-slate-700">
      {{ $t("admin.systemServices") }}
    </h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p class="font-semibold text-slate-700 mb-1">
          {{ $t("admin.systemHealth") }}
        </p>
        <p>
          DB
          <span
            :class="snapshot.health.db ? 'text-emerald-700' : 'text-rose-600'"
          >
            {{
              snapshot.health.db ? $t("admin.systemOk") : $t("admin.systemFail")
            }}
          </span>
        </p>
        <p>
          {{ $t("admin.systemMigrations") }}
          <span
            :class="
              snapshot.health.migrations.ok
                ? 'text-emerald-700'
                : 'text-rose-600'
            "
          >
            {{
              snapshot.health.migrations.ok
                ? $t("admin.systemOk")
                : $t("admin.systemFail")
            }}
          </span>
        </p>
      </div>
      <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p class="font-semibold text-slate-700 mb-1">
          {{ $t("admin.systemCache") }}
        </p>
        <p class="tabular-nums">
          {{ snapshot.cache.driver }}
          · Redis
          {{
            snapshot.cache.redisConfigured
              ? $t("admin.systemConfigured")
              : $t("admin.systemNotConfigured")
          }}
        </p>
      </div>
      <div
        class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2"
      >
        <p class="font-semibold text-slate-700 mb-1">
          {{ $t("admin.systemQueue") }}
        </p>
        <p>
          {{
            snapshot.queue.workerEnabled
              ? $t("admin.systemWorkerOn")
              : $t("admin.systemWorkerOff")
          }}
        </p>
        <div class="mt-2 grid grid-cols-4 gap-1 text-center">
          <div
            v-for="cell in [
              {
                label: 'pending',
                n: snapshot.queue.jobs.pending,
                cls: 'text-amber-700',
              },
              {
                label: 'processing',
                n: snapshot.queue.jobs.processing,
                cls: 'text-sky-700',
              },
              {
                label: 'done',
                n: snapshot.queue.jobs.completed,
                cls: 'text-emerald-700',
              },
              {
                label: 'dead',
                n: snapshot.queue.jobs.dead,
                cls: 'text-rose-700',
              },
            ]"
            :key="cell.label"
            class="rounded-md bg-white border border-slate-200 px-1 py-1.5"
          >
            <p class="text-[10px] uppercase text-slate-500">
              {{ cell.label }}
            </p>
            <p class="text-sm font-semibold tabular-nums" :class="cell.cls">
              {{ cell.n }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
