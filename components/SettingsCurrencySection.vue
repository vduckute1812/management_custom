<script setup lang="ts">
import type { MoneyCurrency } from "~/types/money";

const { t } = useI18n();
const auth = useAuth();
const { pushToast } = useToasts();
const {
  currency: moneyCurrency,
  options: currencyOptions,
  setCurrency,
} = useMoneyCurrency();
const currencyBusy = ref(false);

async function onCurrencySelect(value: number) {
  if (currencyBusy.value || moneyCurrency.value === value) return;
  currencyBusy.value = true;
  try {
    await setCurrency(value as MoneyCurrency);
    pushToast(t("settings.currency.saved"), {
      tone: "success",
      duration: 1800,
    });
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("settings.currency.failed")), {
      tone: "danger",
      duration: 4000,
    });
  } finally {
    currencyBusy.value = false;
  }
}
</script>

<template>
  <section
    v-if="auth.isAuthenticatedUi"
    class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm"
  >
    <header class="px-5 py-3 border-b border-slate-100">
      <h2 class="text-sm font-semibold text-slate-800">
        {{ $t("settings.currency.title") }}
      </h2>
      <p class="text-[11px] text-slate-500">
        {{ $t("settings.currency.subtitle") }}
      </p>
    </header>
    <div class="px-5 py-4">
      <p
        id="settings-currency-label"
        class="text-sm font-medium text-slate-800 mb-2"
      >
        {{ $t("settings.currency.label") }}
      </p>
      <div
        class="flex flex-wrap gap-2"
        role="group"
        aria-labelledby="settings-currency-label"
      >
        <button
          v-for="opt in currencyOptions"
          :key="opt.value"
          type="button"
          class="rounded-lg border px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          :class="
            moneyCurrency === opt.value
              ? 'border-brand-500 bg-brand-50 text-brand-800'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          "
          :aria-pressed="moneyCurrency === opt.value"
          :disabled="currencyBusy"
          @click="onCurrencySelect(opt.value)"
        >
          {{ $t(opt.labelKey) }}
        </button>
      </div>
      <p class="mt-2 text-[11px] text-slate-500">
        {{ $t("settings.currency.hint") }}
      </p>
    </div>
  </section>
</template>
