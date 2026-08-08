<script setup lang="ts">
import type { PostAuthor } from "~/types/post";

defineProps<{
  audience: PostAuthor[];
  results: PostAuthor[];
  searching: boolean;
}>();

const audienceQuery = defineModel<string>("audienceQuery", { required: true });

const emit = defineEmits<{
  (e: "remove-audience", id: string): void;
  (e: "pick-audience", user: PostAuthor): void;
}>();
</script>

<template>
  <div class="manuscript-studio__panel space-y-2">
    <label class="block text-xs font-medium" for="ms-audience">
      {{ $t("feed.composer.shareWith") }}
    </label>
    <div v-if="audience.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="u in audience"
        :key="u.id"
        class="inline-flex items-center gap-1 rounded-full bg-[color:var(--ms-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ms-accent)]"
      >
        {{ u.name || u.email }}
        <button
          type="button"
          class="hover:text-rose-600"
          :aria-label="
            $t('feed.composer.removePerson', { name: u.name || u.email })
          "
          @click="emit('remove-audience', u.id)"
        >
          ×
        </button>
      </span>
    </div>
    <input
      id="ms-audience"
      v-model="audienceQuery"
      type="search"
      autocomplete="off"
      class="manuscript-studio__input"
      :placeholder="$t('feed.composer.searchPeople')"
    />
    <ul
      v-if="audienceQuery.trim() && (searching || results.length)"
      class="max-h-40 overflow-auto rounded-lg border border-[color:var(--ms-rule)] bg-white divide-y divide-[color:var(--ms-rule)]"
      role="listbox"
    >
      <li v-if="searching" class="px-3 py-2 text-xs text-slate-400">
        {{ $t("feed.composer.searching") }}
      </li>
      <li
        v-for="u in results.filter((r) => !audience.some((a) => a.id === r.id))"
        :key="u.id"
      >
        <button
          type="button"
          class="w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--ms-paper)]"
          role="option"
          @click="emit('pick-audience', u)"
        >
          <span class="font-medium">{{ u.name || u.email }}</span>
          <span v-if="u.name" class="block text-[11px] text-slate-500">{{
            u.email
          }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.manuscript-studio__panel {
  border-radius: 1rem;
  border: 1px solid var(--ms-rule);
  background: rgba(255, 255, 255, 0.72);
  padding: 0.95rem;
  backdrop-filter: blur(6px);
  animation: manuscript-rise 520ms cubic-bezier(0.22, 1, 0.36, 1);
}

.manuscript-studio__input {
  width: 100%;
  border-radius: 0.65rem;
  border: 1px solid var(--ms-rule);
  background: #fff;
  padding: 0.55rem 0.7rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ms-ink);
  outline: none;
}

.manuscript-studio__input:focus {
  border-color: var(--ms-accent);
  box-shadow: 0 0 0 3px rgba(63, 111, 90, 0.15);
}

@keyframes manuscript-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

html[data-theme="dark"] .manuscript-studio__panel {
  background: #171d1a;
}

html[data-theme="dark"] .manuscript-studio__input {
  background: #101512;
  color: var(--ms-ink);
}
</style>
