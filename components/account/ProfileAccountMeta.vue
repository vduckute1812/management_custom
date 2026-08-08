<script setup lang="ts">
import { ROLE_I18N_KEYS } from "~/types/auth";
import type { AuthUser } from "~/types/auth";

defineProps<{
  user: AuthUser;
  memberSince: string;
}>();

const { t } = useI18n();
</script>

<template>
  <dl class="mt-6 space-y-3 text-sm">
    <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
      <dt class="text-slate-500">
        {{ $t("profile.role") }}
      </dt>
      <dd class="font-medium text-slate-800">
        {{ t(ROLE_I18N_KEYS[user.role] ?? "roles.normal") }}
      </dd>
    </div>
    <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
      <dt class="text-slate-500">
        {{ $t("profile.emailVerified") }}
      </dt>
      <dd class="font-medium text-slate-800">
        {{ user.emailVerified ? $t("profile.yes") : $t("profile.no") }}
      </dd>
    </div>
    <div class="flex justify-between gap-4 border-t border-slate-100 pt-3">
      <dt class="text-slate-500">
        {{ $t("profile.memberSince") }}
      </dt>
      <dd class="font-medium tabular-nums text-slate-800">
        {{ memberSince }}
      </dd>
    </div>
  </dl>
</template>
