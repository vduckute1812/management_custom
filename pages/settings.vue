<script setup lang="ts">
const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("seo.settings")),
  description: computed(() => t("seo.settingsDescription")),
});

const hasPassword = ref(true);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <SettingsPageHeader />

    <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">
      <div class="max-w-2xl mx-auto space-y-6">
        <SettingsAccountSection @has-password-change="hasPassword = $event" />

        <SettingsLanguageSection />

        <SettingsCurrencySection />

        <SettingsAppearanceSection />

        <SettingsCalendarSection />

        <SettingsNotificationsSection />

        <SettingsDataSection />

        <SettingsDangerZone :has-password="hasPassword" />

        <SettingsPrintSection />
      </div>
    </div>
  </div>
</template>
