<script setup lang="ts">
/**
 * OAuth return bridge.
 *
 * Google callback sets HttpOnly cookies then redirects here. Without this
 * page, `auth.client` would skip cookie refresh (no `auth:hasSession` yet)
 * and the user would land as a guest despite a valid session cookie.
 */
definePageMeta({ layout: false });

const auth = useAuth();
const route = useRoute();
const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("auth.signingIn")),
});

function safeRedirect(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (trimmed.includes("://")) return "/";
  if (trimmed.startsWith("/auth/continue")) return "/";
  if (trimmed.startsWith("/login") || trimmed.startsWith("/signup")) return "/";
  return trimmed;
}

onMounted(async () => {
  const dest = safeRedirect(route.query.redirect);
  try {
    await auth.refresh();
    auth.markSessionUiReady();
    await navigateTo(dest, { replace: true });
  } catch {
    await navigateTo(
      {
        path: "/login",
        query: {
          oauth_error: "failed",
          redirect: dest === "/" ? undefined : dest,
        },
      },
      { replace: true },
    );
  }
});
</script>

<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4"
  >
    <p class="text-sm text-slate-600">{{ $t("auth.signingIn") }}</p>
  </div>
</template>
