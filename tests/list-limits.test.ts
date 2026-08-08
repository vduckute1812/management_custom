import { describe, expect, it } from "vitest";
import {
  ADMIN_USERS_SUMMARY_MAX,
  MONEY_BUDGETS_MONTH_MAX,
  MONEY_USER_CATEGORIES_MAX,
  SAVINGS_CONTRIBUTIONS_PAGE_SIZE,
  SAVINGS_GOALS_MAX,
  STORIES_TRAY_MAX,
  TASKS_UNSCOPED_MAX,
} from "../server/utils/listLimits";

describe("listLimits", () => {
  it("keeps tray and admin caps within sane bounds", () => {
    expect(STORIES_TRAY_MAX).toBeGreaterThanOrEqual(50);
    expect(STORIES_TRAY_MAX).toBeLessThanOrEqual(200);
    expect(ADMIN_USERS_SUMMARY_MAX).toBeGreaterThanOrEqual(100);
    expect(ADMIN_USERS_SUMMARY_MAX).toBeLessThanOrEqual(1000);
  });

  it("keeps money and savings soft caps reasonable", () => {
    expect(SAVINGS_CONTRIBUTIONS_PAGE_SIZE).toBeGreaterThanOrEqual(20);
    expect(SAVINGS_CONTRIBUTIONS_PAGE_SIZE).toBeLessThanOrEqual(100);
    expect(SAVINGS_GOALS_MAX).toBeGreaterThanOrEqual(20);
    expect(SAVINGS_GOALS_MAX).toBeLessThanOrEqual(500);
    expect(MONEY_USER_CATEGORIES_MAX).toBeGreaterThanOrEqual(50);
    expect(MONEY_USER_CATEGORIES_MAX).toBeLessThanOrEqual(500);
    expect(MONEY_BUDGETS_MONTH_MAX).toBeGreaterThanOrEqual(50);
    expect(MONEY_BUDGETS_MONTH_MAX).toBeLessThanOrEqual(500);
  });

  it("keeps task hydration fallback bounded", () => {
    expect(TASKS_UNSCOPED_MAX).toBeGreaterThanOrEqual(100);
    expect(TASKS_UNSCOPED_MAX).toBeLessThanOrEqual(5000);
  });
});
