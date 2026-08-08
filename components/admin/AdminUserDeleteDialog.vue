<script setup lang="ts">
import type { AdminUserSummary } from "~/types/auth";

defineProps<{
  user: AdminUserSummary | null;
  busy: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <ConfirmDialog
    :open="!!user"
    :title="$t('admin.deleteConfirmTitle')"
    :description="
      user
        ? $t('admin.deleteConfirm', {
            name: user.name || user.email,
          })
        : ''
    "
    :busy="busy"
    :confirm-label="$t('admin.remove')"
    @cancel="emit('cancel')"
    @confirm="emit('confirm')"
  />
</template>
