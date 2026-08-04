<script setup lang="ts">
import type { Chart as ChartType, ChartConfiguration } from "chart.js";
import {
  MoneyCurrency,
  MoneyDirection,
  moneyCategoryKey,
  type MoneyCategoryPick,
  type MoneyCurrency as MoneyCurrencyT,
  type MoneyTransaction,
} from "~/types/money";
import { formatMoneyMinor, sumByCategory, sumDaily } from "~/utils/money";

const props = withDefaults(
  defineProps<{
    transactions: MoneyTransaction[];
    yearMonth: string;
    localeTag: string;
    currency?: MoneyCurrencyT;
    activePick?: MoneyCategoryPick | null;
  }>(),
  { currency: MoneyCurrency.VND },
);

const emit = defineEmits<{
  (e: "select-category", pick: MoneyCategoryPick): void;
}>();

const { t } = useI18n();

const categoryCanvas = ref<HTMLCanvasElement | null>(null);
const dailyCanvas = ref<HTMLCanvasElement | null>(null);
let categoryInst: ChartType | null = null;
let dailyInst: ChartType | null = null;
let ChartCtor: typeof ChartType | null = null;

const outSlices = computed(() =>
  sumByCategory(props.transactions, MoneyDirection.Out, t),
);
const daily = computed(() =>
  sumDaily(props.transactions, props.yearMonth, { fillAll: true }),
);
const hasOut = computed(() => outSlices.value.length > 0);
const hasDailyOut = computed(() => daily.value.some((p) => p.outMinor > 0));
const outTotal = computed(() =>
  outSlices.value.reduce((sum, s) => sum + s.amountMinor, 0),
);

const activeKey = computed(() =>
  props.activePick ? moneyCategoryKey(props.activePick) : null,
);

/** Stable string so we avoid deep-watching the transactions array. */
const chartFingerprint = computed(() =>
  [
    props.yearMonth,
    props.localeTag,
    String(props.currency),
    outSlices.value
      .map((s) => `${s.key}:${s.amountMinor}:${s.emoji}:${s.label}:${s.color}`)
      .join(","),
    daily.value.map((p) => `${p.day}:${p.outMinor}`).join(","),
  ].join("#"),
);

function fmt(n: number) {
  return formatMoneyMinor(n, props.localeTag, props.currency);
}

function chartInk() {
  const styles = getComputedStyle(document.documentElement);
  return {
    muted: styles.getPropertyValue("--ink-muted").trim() || "#64748b",
    border: styles.getPropertyValue("--border").trim() || "#e2e8f0",
  };
}

async function ensureChartLib() {
  if (ChartCtor) return ChartCtor;
  const mod = await import("chart.js");
  mod.Chart.register(
    mod.DoughnutController,
    mod.ArcElement,
    mod.BarController,
    mod.BarElement,
    mod.CategoryScale,
    mod.LinearScale,
    mod.Tooltip,
    mod.Legend,
  );
  ChartCtor = mod.Chart;
  return ChartCtor;
}

async function renderCategory() {
  if (!categoryCanvas.value || !hasOut.value) {
    categoryInst?.destroy();
    categoryInst = null;
    return;
  }
  const Chart = await ensureChartLib();
  const slices = outSlices.value;
  const labels = slices.map((s) => `${s.emoji} ${s.label}`);
  const data = slices.map((s) => s.amountMinor);
  const colors = slices.map((s) => s.color);

  if (categoryInst) {
    categoryInst.data.labels = labels;
    const ds = categoryInst.data.datasets[0];
    if (ds) {
      ds.data = data;
      ds.backgroundColor = colors;
    }
    categoryInst.update();
    return;
  }

  const cfg: ChartConfiguration<"doughnut"> = {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const raw = Number(ctx.raw ?? 0);
              return ` ${fmt(raw)}`;
            },
          },
        },
      },
    },
  };
  categoryInst = new Chart(categoryCanvas.value, cfg);
}

async function renderDaily() {
  if (!dailyCanvas.value || !hasDailyOut.value) {
    dailyInst?.destroy();
    dailyInst = null;
    return;
  }
  const Chart = await ensureChartLib();
  const { muted, border } = chartInk();
  const points = daily.value;
  const labels = points.map((p) => p.day.slice(8));
  const data = points.map((p) => p.outMinor);

  if (dailyInst) {
    dailyInst.data.labels = labels;
    const ds = dailyInst.data.datasets[0];
    if (ds) ds.data = data;
    const yTicks = dailyInst.options.scales?.y?.ticks as
      | { color?: string; callback?: (value: string | number) => string }
      | undefined;
    if (yTicks) {
      yTicks.color = muted;
      yTicks.callback = (value) => fmt(Number(value));
    }
    const xTicks = dailyInst.options.scales?.x?.ticks as
      { color?: string } | undefined;
    if (xTicks) xTicks.color = muted;
    dailyInst.update();
    return;
  }

  const cfg: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: "#f43f5e",
          borderRadius: 4,
          maxBarThickness: 18,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              return ` ${fmt(Number(ctx.raw ?? 0))}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: muted,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
          },
          grid: { display: false },
          border: { color: border },
        },
        y: {
          ticks: {
            color: muted,
            callback(value) {
              return fmt(Number(value));
            },
          },
          grid: { color: border },
          border: { display: false },
        },
      },
    },
  };
  dailyInst = new Chart(dailyCanvas.value, cfg);
}

async function renderAll() {
  await Promise.all([renderCategory(), renderDaily()]);
}

watch(chartFingerprint, () => {
  void nextTick(() => renderAll());
});

onMounted(() => {
  void renderAll();
});

onBeforeUnmount(() => {
  categoryInst?.destroy();
  dailyInst?.destroy();
  categoryInst = null;
  dailyInst = null;
});

function pickCategory(pick: MoneyCategoryPick) {
  emit("select-category", pick);
}
</script>

<template>
  <section class="space-y-4" :aria-label="$t('money.chartsAria')">
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div
        class="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-slate-200/80"
      >
        <h2 class="text-sm font-semibold text-slate-800">
          {{ $t("money.chartByCategory") }}
        </h2>
        <p class="mt-0.5 text-[11px] text-slate-500">
          {{ $t("money.chartByCategoryHint") }}
        </p>
        <div
          v-if="hasOut"
          class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[9rem_1fr]"
        >
          <div class="relative mx-auto h-36 w-36">
            <canvas ref="categoryCanvas" />
            <div
              class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
            >
              <p
                class="text-[10px] font-semibold uppercase tracking-wider text-slate-400"
              >
                {{ $t("money.out") }}
              </p>
              <p
                class="max-w-[5.5rem] truncate text-center text-xs font-semibold tabular-nums text-slate-800"
              >
                {{ fmt(outTotal) }}
              </p>
            </div>
          </div>
          <ul class="space-y-1 self-center">
            <li v-for="slice in outSlices" :key="slice.key">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                :class="
                  activeKey === slice.key
                    ? 'bg-slate-900 text-white'
                    : 'hover:bg-slate-50'
                "
                :aria-pressed="activeKey === slice.key"
                @click="pickCategory(slice.pick)"
              >
                <span class="text-sm leading-none" aria-hidden="true">{{
                  slice.emoji
                }}</span>
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full ring-2"
                  :class="
                    activeKey === slice.key
                      ? 'ring-white/40'
                      : 'ring-transparent'
                  "
                  :style="{ backgroundColor: slice.color }"
                  aria-hidden="true"
                />
                <span
                  class="min-w-0 flex-1 truncate"
                  :class="
                    activeKey === slice.key ? 'text-white' : 'text-slate-700'
                  "
                >
                  {{ slice.label }}
                </span>
                <span
                  class="tabular-nums"
                  :class="
                    activeKey === slice.key ? 'text-white/70' : 'text-slate-500'
                  "
                >
                  {{ Math.round(slice.share * 100) }}%
                </span>
                <span
                  class="shrink-0 tabular-nums font-medium"
                  :class="
                    activeKey === slice.key ? 'text-white' : 'text-slate-800'
                  "
                >
                  {{ fmt(slice.amountMinor) }}
                </span>
              </button>
            </li>
          </ul>
        </div>
        <p v-else class="mt-6 text-center text-xs text-slate-400">
          {{ $t("money.chartEmpty") }}
        </p>
      </div>

      <div
        class="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-slate-200/80"
      >
        <h2 class="text-sm font-semibold text-slate-800">
          {{ $t("money.chartDaily") }}
        </h2>
        <p class="mt-0.5 text-[11px] text-slate-500">
          {{ $t("money.chartDailyHint") }}
        </p>
        <div v-if="hasDailyOut" class="relative mt-3 h-44">
          <canvas ref="dailyCanvas" />
        </div>
        <p v-else class="mt-6 text-center text-xs text-slate-400">
          {{ $t("money.chartEmpty") }}
        </p>
      </div>
    </div>
  </section>
</template>
