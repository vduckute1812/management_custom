<script setup lang="ts">
defineProps<{
  originalTitle: string;
  rawContent: string;
}>();
</script>

<template>
  <section
    class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col h-[min(70vh,36rem)]"
  >
    <h2 class="text-sm font-semibold text-slate-800 mb-2 shrink-0">
      {{ $t("adminArticles.originalPanel") }}
    </h2>
    <p class="text-base font-medium text-slate-900 mb-3 shrink-0">
      {{ originalTitle }}
    </p>
    <div
      class="flex-1 min-h-0 overflow-y-auto text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-100 rounded-lg p-3 bg-slate-50"
    >
      <p v-if="!(rawContent || '').trim()" class="text-slate-400 italic">
        {{ $t("adminArticles.noOriginalBody") }}
      </p>
      <template v-else>
        {{ rawContent }}
      </template>
    </div>
  </section>
</template>
