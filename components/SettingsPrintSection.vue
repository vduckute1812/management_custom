<template>
  <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
    <header class="px-5 py-3 border-b border-slate-100">
      <h2 class="text-sm font-semibold text-slate-800">
        {{ $t("settings.print.title") }}
      </h2>
      <p class="text-[11px] text-slate-500">
        {{ $t("settings.print.subtitle") }}
      </p>
    </header>
    <div class="px-5 py-4 text-xs text-slate-600 leading-relaxed">
      {{ $t("settings.print.body") }}
      <NuxtLink to="/tasks" class="ml-1 text-brand-700 hover:underline">
        {{ $t("settings.print.dashboardLink") }}
      </NuxtLink>
    </div>
  </section>
</template>
