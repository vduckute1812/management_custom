<script setup lang="ts">
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import {
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "~/types/task";

dayjs.extend(isoWeek);

const { tasks, fetchAll, isLoading } = useTasks();
const { epics, fetchAll: fetchEpics, findEpic, colorOfTask } = useEpics();
const { pushToast } = useToasts();
const { load: loadSamples } = useSampleData();

const seeding = ref(false);

await useAsyncData("analytics:initial", async () => {
  await Promise.all([fetchAll(), fetchEpics()]);
  return { ok: true };
});

const granularity = ref<"day" | "week" | "month">("week");

usePageShortcuts([
  { key: "1", handler: () => (granularity.value = "day") },
  { key: "2", handler: () => (granularity.value = "week") },
  { key: "3", handler: () => (granularity.value = "month") },
]);

const taggedBreakdown = computed(() => {
  const map = new Map<
    string,
    { count: number; estimated: number; spent: number }
  >();
  for (const t of tasks.value) {
    for (const tag of t.tags ?? ["untagged"]) {
      const entry = map.get(tag) ?? { count: 0, estimated: 0, spent: 0 };
      entry.count += 1;
      entry.estimated += t.estimatedHours ?? 0;
      entry.spent += t.spentHours ?? 0;
      map.set(tag, entry);
    }
  }
  return Array.from(map.entries())
    .map(([tag, v]) => ({
      tag,
      count: v.count,
      estimated: Math.round(v.estimated * 10) / 10,
      spent: Math.round(v.spent * 10) / 10,
    }))
    .sort((a, b) => b.spent - a.spent);
});

const isEmpty = computed(
  () => !isLoading.value && tasks.value.length === 0 && epics.value.length === 0
);

async function seedSamples() {
  seeding.value = true;
  try {
    await loadSamples();
    pushToast("Sample data loaded", { tone: "success" });
  } catch (err) {
    pushToast(
      err instanceof Error ? err.message : "Failed to load samples",
      { tone: "danger" }
    );
  } finally {
    seeding.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between"
    >
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Analytics</h1>
        <p class="text-xs text-slate-500 mt-0.5">
          Track velocity, accuracy, and completion trends over time
        </p>
      </div>
      <div class="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden">
        <button
          v-for="opt in (['day', 'week', 'month'] as const)"
          :key="opt"
          class="px-3 py-1.5 text-xs font-medium capitalize transition"
          :class="
            granularity === opt
              ? 'bg-brand-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          "
          @click="granularity = opt"
        >
          {{ opt }}
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6 space-y-6">
      <SkeletonList v-if="isLoading" variant="card" :rows="4" />

      <div
        v-else-if="isEmpty"
        class="h-full flex items-center justify-center"
      >
        <EmptyState
          title="Analytics need data"
          description="We'll show velocity, completion rate, and variance after you log a few time blocks."
          illustration="chart"
          secondary-label="Load sample data"
          :secondary-loading="seeding"
          @secondary="seedSamples"
        />
      </div>

      <template v-else>
        <ClientOnly>
          <AnalyticsDashboard
            :tasks="tasks"
            :epics="epics"
            :granularity="granularity"
          />
          <template #fallback>
            <p class="text-sm text-slate-500">Preparing charts…</p>
          </template>
        </ClientOnly>

        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-4 py-3 border-b border-slate-100">
            <h3 class="text-sm font-semibold text-slate-800">
              Time by tag
            </h3>
            <p class="text-[11px] text-slate-500">
              Distribution of estimated and actual hours across tags
            </p>
          </header>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50">
                  <th class="px-4 py-2 font-medium">Tag</th>
                  <th class="px-4 py-2 font-medium tabular-nums">Tasks</th>
                  <th class="px-4 py-2 font-medium tabular-nums">Estimated</th>
                  <th class="px-4 py-2 font-medium tabular-nums">Spent</th>
                  <th class="px-4 py-2 font-medium tabular-nums">Variance</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="row in taggedBreakdown" :key="row.tag">
                  <td class="px-4 py-2 font-medium text-slate-800">
                    <span
                      class="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700"
                    >
                      {{ row.tag }}
                    </span>
                  </td>
                  <td class="px-4 py-2 tabular-nums text-slate-700">{{ row.count }}</td>
                  <td class="px-4 py-2 tabular-nums text-slate-700">{{ row.estimated }}h</td>
                  <td class="px-4 py-2 tabular-nums text-slate-700">{{ row.spent }}h</td>
                  <td
                    class="px-4 py-2 tabular-nums font-medium"
                    :class="
                      row.spent - row.estimated > 0
                        ? 'text-rose-600'
                        : 'text-emerald-600'
                    "
                  >
                    {{ row.spent - row.estimated > 0 ? "+" : "" }}{{ Math.round((row.spent - row.estimated) * 10) / 10 }}h
                  </td>
                </tr>
                <tr v-if="taggedBreakdown.length === 0">
                  <td colspan="5" class="px-4 py-8 text-center text-xs text-slate-400 italic">
                    No tagged tasks yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-4 py-3 border-b border-slate-100">
            <h3 class="text-sm font-semibold text-slate-800">
              All tasks
            </h3>
          </header>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50">
                  <th class="px-4 py-2 font-medium">Title</th>
                  <th class="px-4 py-2 font-medium">Epic</th>
                  <th class="px-4 py-2 font-medium">Status</th>
                  <th class="px-4 py-2 font-medium">Priority</th>
                  <th class="px-4 py-2 font-medium tabular-nums">Due</th>
                  <th class="px-4 py-2 font-medium tabular-nums">Est.</th>
                  <th class="px-4 py-2 font-medium tabular-nums">Spent</th>
                  <th class="px-4 py-2 font-medium tabular-nums">Progress</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="t in tasks" :key="t.id">
                  <td class="px-4 py-2 text-slate-800 font-medium">
                    <div class="flex items-center gap-2">
                      <span
                        class="w-2 h-2 rounded-full"
                        :class="colorOfTask(t).solid"
                      />
                      {{ t.title }}
                    </div>
                  </td>
                  <td class="px-4 py-2 text-slate-600 text-xs">
                    {{ findEpic(t.epicId)?.title ?? "—" }}
                  </td>
                  <td class="px-4 py-2">
                    <span
                      class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      :class="STATUS_COLORS[t.status]"
                    >
                      {{ STATUS_LABELS[t.status] }}
                    </span>
                  </td>
                  <td class="px-4 py-2">
                    <span
                      v-if="t.priority"
                      class="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                      :class="PRIORITY_BADGE[t.priority]"
                    >
                      {{ PRIORITY_LABELS[t.priority] }}
                    </span>
                  </td>
                  <td class="px-4 py-2 tabular-nums text-slate-600">
                    {{ t.dueDate || "—" }}
                  </td>
                  <td class="px-4 py-2 tabular-nums text-slate-600">
                    {{ t.estimatedHours ?? "—" }}
                  </td>
                  <td class="px-4 py-2 tabular-nums text-slate-600">
                    {{ t.spentHours ?? "—" }}
                  </td>
                  <td class="px-4 py-2 tabular-nums text-slate-600">
                    {{ t.progress ?? 0 }}%
                  </td>
                </tr>
                <tr v-if="tasks.length === 0">
                  <td colspan="8" class="px-4 py-8 text-center text-xs text-slate-400 italic">
                    No tasks yet. Head back to the dashboard to add one.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
