<script setup lang="ts">
/**
 * Shared Google OAuth CTA — full-page redirect to /api/auth/google.
 * Link intent refreshes the access cookie first so a stale 15-min JWT
 * does not 401 the start endpoint while the SPA still looks signed-in.
 */
const props = withDefaults(
  defineProps<{
    intent?: "login" | "link";
    redirect?: string;
    busy?: boolean;
    label?: string;
  }>(),
  {
    intent: "login",
    redirect: "/",
    busy: false,
    label: undefined,
  },
);

const emit = defineEmits<{
  (e: "busy", value: boolean): void;
}>();

const starting = ref(false);

async function startGoogle() {
  if (props.busy || starting.value) return;
  starting.value = true;
  emit("busy", true);
  try {
    if (props.intent === "link") {
      const auth = useAuth();
      try {
        await auth.refresh();
      } catch {
        await navigateTo({
          path: "/login",
          query: { redirect: "/settings", oauth_error: "auth" },
        });
        return;
      }
    }
    const params = new URLSearchParams({
      intent: props.intent,
      redirect: props.redirect || "/",
    });
    window.location.assign(`/api/auth/google?${params.toString()}`);
  } finally {
    // Full navigation usually unloads; keep local state tidy if it does not.
    starting.value = false;
    emit("busy", false);
  }
}
</script>

<template>
  <button
    type="button"
    class="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
    :disabled="busy || starting"
    @click="startGoogle"
  >
    <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3 5.7 15l-2.5 1.9C4.8 20 8.1 22 12 22c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 1-3.6 1-2.8 0-5.1-1.9-6-4.4z"
      />
      <path
        fill="#4A90E2"
        d="M3.2 7.1C2.4 8.6 2 10.2 2 12s.4 3.4 1.2 4.9l3.4-2.6C6.2 13.4 6 12.7 6 12s.2-1.4.6-2.1L3.2 7.1z"
      />
      <path
        fill="#FBBC05"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.9 14.7 2 12 2 8.1 2 4.8 4 3.2 7.1l3.4 2.6C7 7.9 9.2 6 12 6z"
      />
    </svg>
    <span>{{ label || $t("auth.continueWithGoogle") }}</span>
  </button>
</template>
