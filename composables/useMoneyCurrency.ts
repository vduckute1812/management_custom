import {
  MONEY_CURRENCIES,
  MONEY_CURRENCY_CODE,
  MONEY_CURRENCY_I18N_KEYS,
  isMoneyCurrency,
  type MoneyCurrency as MoneyCurrencyT,
} from "~/types/money";
import {
  defaultMoneyCurrencyForLocale,
  INTL_LOCALE,
  isAppLocale,
  type AppLocale,
} from "~/types/locale";

/**
 * Active Money currency for the signed-in user (AuthUser.moneyCurrency),
 * falling back to the locale default for guests / legacy sessions.
 */
export function useMoneyCurrency() {
  const auth = useAuth();
  const { settings } = useSettings();
  const { locale } = useI18n();

  const currency = computed<MoneyCurrencyT>(() => {
    const fromUser = auth.user.value?.moneyCurrency;
    if (isMoneyCurrency(fromUser)) return fromUser;
    const loc = isAppLocale(settings.value.locale)
      ? settings.value.locale
      : isAppLocale(locale.value)
        ? locale.value
        : "en";
    return defaultMoneyCurrencyForLocale(loc as AppLocale);
  });

  const currencyCode = computed(
    () => MONEY_CURRENCY_CODE[currency.value] ?? "VND",
  );

  const intlLocale = computed(() => {
    const loc = isAppLocale(locale.value) ? locale.value : "en";
    return INTL_LOCALE[loc];
  });

  const options = computed(() =>
    MONEY_CURRENCIES.map((c) => ({
      value: c,
      code: MONEY_CURRENCY_CODE[c],
      labelKey: MONEY_CURRENCY_I18N_KEYS[c],
    })),
  );

  async function setCurrency(next: MoneyCurrencyT): Promise<void> {
    if (!isMoneyCurrency(next)) return;
    if (!auth.isAuthenticated.value) return;
    await auth.updatePreferences({ moneyCurrency: next });
  }

  async function syncLocaleToServer(next: AppLocale): Promise<void> {
    if (!auth.isAuthenticated.value) return;
    if (!isAppLocale(next)) return;
    if (auth.user.value?.locale === next) return;
    try {
      await auth.updatePreferences({ locale: next });
    } catch {
      // Non-fatal — local UI language still updates.
    }
  }

  return {
    currency,
    currencyCode,
    intlLocale,
    options,
    setCurrency,
    syncLocaleToServer,
  };
}
