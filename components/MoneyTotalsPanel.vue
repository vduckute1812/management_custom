<script setup lang="ts">
defineProps<{
  inLabel: string;
  outLabel: string;
  netLabel: string;
  inValue: string;
  outValue: string;
  netValue: string;
  netTone: "in" | "out" | "neutral";
  totalsAria: string;
}>();
</script>

<template>
  <section
    class="grid grid-cols-1 gap-3 sm:grid-cols-3"
    :aria-label="totalsAria"
  >
    <MoneyStatCard :label="inLabel" :value="inValue" tone="in" />
    <MoneyStatCard :label="outLabel" :value="outValue" tone="out" />
    <MoneyStatCard :label="netLabel" :value="netValue" :tone="netTone" />
  </section>
</template>
