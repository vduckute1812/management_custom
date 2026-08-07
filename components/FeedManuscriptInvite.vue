<template>
  <NuxtLink
    to="/feed/write"
    class="manuscript-invite group relative block overflow-hidden rounded-2xl border border-[color:var(--mf-border)] px-5 py-5 transition hover:-translate-y-0.5 hover:border-[color:var(--mf-border-hover)] hover:shadow-md sm:px-6"
  >
    <div class="relative z-[1] max-w-xl">
      <p
        class="feed-manuscript-kicker text-[11px] font-bold uppercase tracking-[0.18em]"
      >
        {{ $t("manuscript.inviteKicker") }}
      </p>
      <p
        class="mt-1 font-[family-name:var(--font-manuscript,Georgia,serif)] text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"
        style="
          font-family:
            &quot;Source Serif 4&quot;, Georgia, &quot;Times New Roman&quot;,
            serif;
        "
      >
        {{ $t("manuscript.inviteTitle") }}
      </p>
      <p class="mt-2 text-sm leading-6 text-slate-600">
        {{ $t("manuscript.inviteBody") }}
      </p>
      <span
        class="feed-manuscript-action mt-3 inline-flex items-center gap-1.5 text-sm font-semibold transition group-hover:gap-2"
      >
        {{ $t("manuscript.inviteAction") }}
        <span aria-hidden="true">→</span>
      </span>
    </div>
  </NuxtLink>
</template>

<style scoped>
.manuscript-invite {
  background:
    linear-gradient(
      135deg,
      rgba(228, 239, 232, 0.95),
      rgba(247, 248, 246, 0.98)
    ),
    radial-gradient(circle at 100% 0%, rgba(63, 111, 90, 0.12), transparent 40%);
}

.manuscript-invite::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(180deg, var(--mf-accent), transparent 80%);
}

html[data-theme="dark"] .manuscript-invite {
  background: linear-gradient(
    135deg,
    rgba(36, 49, 42, 0.95),
    rgba(17, 24, 22, 0.98)
  );
  border-color: #2a332e;
}

html[data-theme="dark"] .manuscript-invite .text-slate-900 {
  color: #f1f5f9 !important;
}

html[data-theme="dark"] .manuscript-invite .text-slate-600 {
  color: #94a3b8 !important;
}
</style>
