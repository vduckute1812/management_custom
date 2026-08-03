<script setup lang="ts">
import type { Chart as ChartType, ChartConfiguration } from "chart.js";
import {
  MONEY_CATEGORY_COLORS,
  MONEY_CATEGORY_I18N_KEYS,
  MoneyDirection,
  type MoneyTransaction,
} from "~/types/money";
import { formatMoneyMinor, sumByCategory, sumDaily } from "~/utils/money";

const props = defineProps<{
  transactions: MoneyTransaction[];
  yearMonth: string;
  localeTag: string;
  activeCategory?: MoneyTransaction["category"] | null;
}>();

const emit = defineEmits<{
  (e: "select-category", category: MoneyTransaction["category"]): void;
}>();

const { t } = useI18n();

const categoryCanvas = ref<HTMLCanvasElement | null>(null);
const dailyCanvas = ref<HTMLCanvasElement | null>(null);
let categoryInst: ChartType | null = null;
let dailyInst: ChartType | null = null;
let ChartCtor: typeof ChartType | null = null;

const outSlices = computed(() =>
  sumByCategory(props.transactions, MoneyDirection.Out),
);
const daily = computed(() =>
  sumDaily(props.transactions, props.yearMonth, { fillAll: true }),
);
const hasOut = computed(() => outSlices.value.length > 0);
const hasDailyOut = computed(() => daily.value.some((p) => p.outMinor > 0));
const outTotal = computed(() =>
  outSlices.value.reduce((sum, s) => sum + s.amountMinor, 0),
);

function fmt(n: number) {
  return formatMoneyMinor(n, props.localeTag);
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
  const cfg: ChartConfiguration<"doughnut"> = {
    type: "doughnut",
    data: {
      labels: slices.map((s) => t(MONEY_CATEGORY_I18N_KEYS[s.category])),
      datasets: [
        {
          data: slices.map((s) => s.amountMinor),
          backgroundColor: slices.map((s) => MONEY_CATEGORY_COLORS[s.category]),
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
  categoryInst?.destroy();
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
  const cfg: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels: points.map((p) => p.day.slice(8)),
      datasets: [
        {
          label: t("money.out"),
          data: points.map((p) => p.outMinor),
          backgroundColor: "rgba(244, 63, 94, 0.65)",
          borderRadius: 4,
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
            title(items) {
              const i = items[0]?.dataIndex ?? 0;
              return points[i]?.day ?? "";
            },
            label(ctx) {
              return ` ${fmt(Number(ctx.raw ?? 0))}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: muted,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: border },
          ticks: {
            color: muted,
            callback(value) {
              const n = Number(value);
              if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
              if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
              return String(n);
            },
          },
        },
      },
    },
  };
  dailyInst?.destroy();
  dailyInst = new Chart(dailyCanvas.value, cfg);
}

async function renderAll() {
  await Promise.all([renderCategory(), renderDaily()]);
}

watch(
  () => [props.transactions, props.yearMonth, props.localeTag] as const,
  () => {
    void nextTick(() => renderAll());
  },
  { deep: true },
);

onMounted(() => {
  void renderAll();
});

onBeforeUnmount(() => {
  categoryInst?.destroy();
  dailyInst?.destroy();
  categoryInst = null;
  dailyInst = null;
});

function pickCategory(category: (typeof outSlices.value)[number]["category"]) {
  emit("select-category", category);
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
            <li v-for="slice in outSlices" :key="slice.category">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                :class="
                  activeCategory === slice.category
                    ? 'bg-slate-900 text-white'
                    : 'hover:bg-slate-50'
                "
                :aria-pressed="activeCategory === slice.category"
                @click="pickCategory(slice.category)"
              >
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full ring-2"
                  :class="
                    activeCategory === slice.category
                      ? 'ring-white/40'
                      : 'ring-transparent'
                  "
                  :style="{
                    backgroundColor: MONEY_CATEGORY_COLORS[slice.category],
                  }"
                  aria-hidden="true"
                />
                <span
                  class="min-w-0 flex-1 truncate"
                  :class="
                    activeCategory === slice.category
                      ? 'text-white'
                      : 'text-slate-700'
                  "
                >
                  {{ $t(MONEY_CATEGORY_I18N_KEYS[slice.category]) }}
                </span>
                <span
                  class="tabular-nums"
                  :class="
                    activeCategory === slice.category
                      ? 'text-white/70'
                      : 'text-slate-500'
                  "
                >
                  {{ Math.round(slice.share * 100) }}%
                </span>
                <span
                  class="shrink-0 tabular-nums font-medium"
                  :class="
                    activeCategory === slice.category
                      ? 'text-white'
                      : 'text-slate-800'
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
