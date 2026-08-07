/** Hard cap for active story tray rows (24h TTL; newest first). */
export const STORIES_TRAY_MAX = 100;

/** Soft cap for admin user summary table (small multi-tenant installs). */
export const ADMIN_USERS_SUMMARY_MAX = 500;

/** Default page size for savings contribution history. */
export const SAVINGS_CONTRIBUTIONS_PAGE_SIZE = 50;

/** Soft cap for savings goals list (UI is a single page). */
export const SAVINGS_GOALS_MAX = 100;

/** Soft cap for custom money categories per user. */
export const MONEY_USER_CATEGORIES_MAX = 200;

/** Soft cap for budget rows in a single year-month. */
export const MONEY_BUDGETS_MONTH_MAX = 200;

/**
 * Fallback max when getAllTasks is called without an explicit limit
 * (e.g. epic roll-up hydration). List APIs pass their own page size.
 */
export const TASKS_UNSCOPED_MAX = 1000;
