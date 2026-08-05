<script setup lang="ts">
withDefaults(
  defineProps<{
    editing?: boolean;
    submitting?: boolean;
    canSubmit: boolean;
  }>(),
  {
    editing: false,
    submitting: false,
  },
);

const emit = defineEmits<{
  (e: "cancel"): void;
}>();
</script>

<template>
  <header class="manuscript-studio__chrome">
    <div class="min-w-0">
      <p class="manuscript-studio__kicker">
        {{ $t("manuscript.studioKicker") }}
      </p>
      <h1 class="manuscript-studio__heading">
        {{
          editing
            ? $t("manuscript.editStudioTitle")
            : $t("manuscript.studioTitle")
        }}
      </h1>
      <p class="manuscript-studio__lede">
        {{
          editing
            ? $t("manuscript.editStudioLede")
            : $t("manuscript.studioLede")
        }}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="manuscript-studio__ghost"
        @click="emit('cancel')"
      >
        {{ $t("manuscript.cancel") }}
      </button>
      <button
        type="submit"
        class="manuscript-studio__publish"
        :disabled="!canSubmit"
      >
        {{
          editing
            ? submitting
              ? $t("manuscript.updating")
              : $t("manuscript.update")
            : submitting
              ? $t("manuscript.publishing")
              : $t("manuscript.publish")
        }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.manuscript-studio__chrome {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.manuscript-studio__kicker {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ms-accent);
}

.manuscript-studio__heading {
  margin-top: 0.35rem;
  font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
  font-size: clamp(1.6rem, 2.4vw, 2.1rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.manuscript-studio__lede {
  margin-top: 0.4rem;
  max-width: 36rem;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--ms-muted);
}

.manuscript-studio__ghost {
  border-radius: 0.75rem;
  border: 1px solid var(--ms-rule);
  background: transparent;
  padding: 0.6rem 0.95rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ms-ink);
  transition: background 160ms ease;
}

.manuscript-studio__ghost:hover {
  background: rgba(255, 255, 255, 0.55);
}

.manuscript-studio__publish {
  border-radius: 0.75rem;
  background: var(--ms-accent);
  padding: 0.65rem 1.1rem;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #fff;
  box-shadow: 0 8px 20px rgba(63, 111, 90, 0.18);
  transition:
    transform 160ms ease,
    background 160ms ease;
}

.manuscript-studio__publish:hover:not(:disabled) {
  background: #345c4a;
  transform: translateY(-1px);
}

.manuscript-studio__publish:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
