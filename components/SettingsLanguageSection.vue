<template>
  <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
    <header class="px-5 py-3 border-b border-slate-100">
      <h2 class="text-sm font-semibold text-slate-800">
        {{ $t("settings.language.title") }}
      </h2>
      <p class="text-[11px] text-slate-500">
        {{ $t("settings.language.subtitle") }}
      </p>
    </header>
    <div class="px-5 py-4">
      <p
        id="settings-language-label"
        class="text-sm font-medium text-slate-800 mb-2"
      >
        {{ $t("settings.language.label") }}
      </p>
      <LanguageSwitcher id="settings-language-label" variant="buttons" />
    </div>
  </section>
</template>
