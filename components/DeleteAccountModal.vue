<script setup lang="ts">
/**
 * Typed-confirmation dialog for account deletion. Deliberately not
 * `ConfirmDialog`: an irreversible, cross-user-visible delete earns two
 * deliberate keystroke gates (the address, and the password when the account
 * has one) rather than a single button press.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    accountEmail: string;
    requiresPassword?: boolean;
    busy?: boolean;
    error?: string;
  }>(),
  { requiresPassword: true, busy: false, error: "" },
);

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "confirm", payload: { email: string; password: string }): void;
}>();

const rootEl = ref<HTMLElement | null>(null);
const emailInput = ref<HTMLInputElement | null>(null);
const titleId = useId();
const descId = useId();

const typedEmail = ref("");
const password = ref("");

const canSubmit = computed(() =>
  canConfirmAccountDeletion({
    typedEmail: typedEmail.value,
    accountEmail: props.accountEmail,
    requiresPassword: props.requiresPassword,
    password: password.value,
    busy: props.busy,
  }),
);

const isOpen = computed(() => props.open);
useModal(isOpen, {
  container: rootEl,
  initialFocus: emailInput,
  onClose: () => {
    if (!props.busy) emit("cancel");
  },
});

watch(isOpen, (open) => {
  if (!open) return;
  typedEmail.value = "";
  password.value = "";
});

function onBackdrop(e: MouseEvent) {
  if (props.busy) return;
  if (e.target === e.currentTarget) emit("cancel");
}

function onSubmit() {
  if (!canSubmit.value) return;
  emit("confirm", { email: typedEmail.value.trim(), password: password.value });
}
</script>

<template>
  <Teleport to="body">
    <Transition name="delete-account-fade">
      <div
        v-if="open"
        ref="rootEl"
        class="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descId"
        @mousedown="onBackdrop"
      >
        <form
          class="my-auto w-full max-w-md rounded-xl bg-white p-5 shadow-xl ring-1 ring-rose-200"
          @submit.prevent="onSubmit"
        >
          <h3 :id="titleId" class="text-sm font-semibold text-rose-700">
            {{ $t("settings.danger.modalTitle") }}
          </h3>
          <p :id="descId" class="mt-1 text-xs text-slate-600">
            {{ $t("settings.danger.modalIntro") }}
          </p>

          <ul
            class="mt-3 space-y-1 rounded-lg bg-rose-50 px-3 py-2.5 text-[11px] text-rose-800"
          >
            <li>{{ $t("settings.danger.itemTasks") }}</li>
            <li>{{ $t("settings.danger.itemFeed") }}</li>
            <li>{{ $t("settings.danger.itemChat") }}</li>
            <li>{{ $t("settings.danger.itemMoney") }}</li>
            <li>{{ $t("settings.danger.itemUploads") }}</li>
          </ul>

          <p class="mt-3 text-xs font-medium text-slate-700">
            {{ $t("settings.danger.permanent") }}
          </p>

          <div class="mt-4 space-y-3">
            <div>
              <label
                for="delete-account-email"
                class="block text-xs font-medium text-slate-600 mb-1"
              >
                {{ $t("settings.danger.emailLabel", { email: accountEmail }) }}
              </label>
              <input
                id="delete-account-email"
                ref="emailInput"
                v-model="typedEmail"
                type="text"
                autocomplete="off"
                spellcheck="false"
                :disabled="busy"
                class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400 disabled:opacity-60"
              />
            </div>

            <div v-if="requiresPassword">
              <label
                for="delete-account-password"
                class="block text-xs font-medium text-slate-600 mb-1"
              >
                {{ $t("settings.danger.passwordLabel") }}
              </label>
              <input
                id="delete-account-password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                :disabled="busy"
                class="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400 disabled:opacity-60"
              />
            </div>
            <p v-else class="text-[11px] text-slate-500">
              {{ $t("settings.danger.googleOnlyHint") }}
            </p>
          </div>

          <p
            v-if="error"
            class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            role="alert"
          >
            {{ error }}
          </p>

          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              :disabled="busy"
              @click="emit('cancel')"
            >
              {{ $t("common.cancel") }}
            </button>
            <button
              type="submit"
              class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!canSubmit"
            >
              {{
                busy
                  ? $t("settings.danger.deleting")
                  : $t("settings.danger.confirmButton")
              }}
            </button>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.delete-account-fade-enter-active,
.delete-account-fade-leave-active {
  transition: opacity 0.15s ease;
}
.delete-account-fade-enter-from,
.delete-account-fade-leave-to {
  opacity: 0;
}
</style>
