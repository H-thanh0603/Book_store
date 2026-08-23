// Timezone-aware period boundaries. Reporting windows ("today", "this month")
// are business-day concepts — they must follow the store's wall clock, not the
// server's host timezone. APP_TIMEZONE overrides the default.

export const BUSINESS_TZ = process.env.APP_TIMEZONE ?? "Asia/Ho_Chi_Minh";

function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUTC - date.getTime();
}

/** UTC instant of local midnight for the business timezone. */
export function zonedStartOfDay(date = new Date(), tz = BUSINESS_TZ): Date {
  const offset = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

/** UTC instant of local first-of-month for the business timezone. */
export function zonedStartOfMonth(date = new Date(), tz = BUSINESS_TZ): Date {
  const offset = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + offset);
  local.setUTCDate(1);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

/**
 * Calendar-safe "n months ago" boundary in the business timezone: Jan 29/30/31
 * minus one month clamps to the last day of the target month instead of
 * rolling into the month after (setMonth overflow).
 */
export function zonedMonthsAgo(n: number, date = new Date(), tz = BUSINESS_TZ): Date {
  const offset = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + offset);
  const targetMonthIndex = local.getUTCMonth() - n;
  const target = new Date(Date.UTC(local.getUTCFullYear(), targetMonthIndex, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(local.getUTCDate(), lastDay));
  target.setUTCHours(local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), 0);
  return new Date(target.getTime() - offset);
}
