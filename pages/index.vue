<script setup lang="ts">
const auth = useAuth();

useSeoMeta({
  title: "Home",
  description:
    "Management — overview of the Feed and Time Management modules.",
});
</script>

<template>
  <div class="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
    <header class="max-w-2xl">
      <p class="text-sm font-medium uppercase tracking-wide text-brand-600">
        Management
      </p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Welcome{{ auth.user.value?.name ? `, ${auth.user.value.name}` : "" }}
      </h1>
      <p class="mt-4 text-base leading-relaxed text-slate-600">
        This workspace has two independent modules. Use the header to move
        between them — there is no cross-linking inside either module.
      </p>
    </header>

    <section class="mt-10 space-y-6 text-sm leading-relaxed text-slate-600">
      <div>
        <h2 class="text-base font-semibold text-slate-900">Feed</h2>
        <p class="mt-1.5">
          Share posts with categories, LaTeX formulas, and styled text. Browse
          stories with viewers and reactions. Visibility can be public, private,
          or limited to specific people.
        </p>
      </div>
      <div>
        <h2 class="text-base font-semibold text-slate-900">Time Management</h2>
        <p class="mt-1.5">
          Plan your day on the calendar, organize work into epics, run timers,
          and review analytics — completely separate from the Feed.
        </p>
      </div>
      <p class="text-slate-500">
        Open <span class="font-medium text-slate-700">Feed</span> or
        <span class="font-medium text-slate-700">Time Management</span> from the
        header
        <template v-if="!auth.isAuthenticated.value">
          · use <span class="font-medium text-slate-700">Login</span> /
          <span class="font-medium text-slate-700">Register</span> to manage
          tasks and post privately
        </template>
        .
      </p>
    </section>
  </div>
</template>
