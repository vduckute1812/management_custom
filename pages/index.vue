<script setup lang="ts">
const auth = useAuth();

useSeoMeta({
  title: "Home",
  description: "Choose Time management or Feed.",
});
</script>

<template>
  <div class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center px-4 py-10 sm:px-6">
    <header class="mb-10 max-w-xl">
      <p class="text-sm font-medium uppercase tracking-wide text-brand-600">
        Management
      </p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Welcome{{ auth.user.value?.name ? `, ${auth.user.value.name}` : "" }}
      </h1>
      <p class="mt-3 text-base text-slate-600">
        Jump into your calendar and tasks, or open the Feed to share stories and
        documents with your team.
      </p>
    </header>

    <div class="grid gap-4 sm:grid-cols-2 sm:gap-6">
      <NuxtLink
        to="/tasks"
        class="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span
          class="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
          aria-hidden="true"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
          </svg>
        </span>
        <h2 class="mt-5 text-xl font-semibold text-slate-900">Time management</h2>
        <p class="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
          Plan your day, track tasks and epics, and run timers on the calendar
          dashboard.
        </p>
        <span class="mt-5 text-sm font-medium text-brand-700 group-hover:underline">
          Open dashboard →
        </span>
      </NuxtLink>

      <NuxtLink
        to="/feed"
        class="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span
          class="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
          aria-hidden="true"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 8h2a2 2 0 012 2v8a2 2 0 01-2 2H7l-4 4V10a2 2 0 012-2h2m4-4h6a2 2 0 012 2v6M9 4H7a2 2 0 00-2 2v6" />
          </svg>
        </span>
        <h2 class="mt-5 text-xl font-semibold text-slate-900">Feed</h2>
        <p class="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
          Write documents, share stories, react and comment — public, private, or
          with specific people.
        </p>
        <span class="mt-5 text-sm font-medium text-brand-700 group-hover:underline">
          Open feed →
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
