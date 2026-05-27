/**
 * Centralized date/time utilities for the clubSOS app.
 *
 * SINGLE SOURCE OF TRUTH for any code that displays a date, formats a time,
 * or compares against Nicaragua's calendar. All `.toLocale*` calls and any
 * reference to `"America/Managua"` outside this module are prohibited
 * (verified by grep gate in CI). Two controlled exceptions:
 *   - SQL migrations (Postgres timezone literals)
 *   - `<FullCalendar timeZone="America/Managua">` prop in AdminCalendarioCitas
 *
 * Why centralized: cross-tz users (testing from Australia / EU / etc.) were
 * seeing wrong calendar days, wrong cutoffs, and confused appointment times
 * because each component reinvented timezone handling.
 */

export const NICARAGUA_TZ = "America/Managua";

export type Loc = "es" | "en";

function intlLocale(loc: Loc): string {
  return loc === "en" ? "en-US" : "es-NI";
}

// ── "Now" / today in Nicaragua ───────────────────────────────────────────

/** A YYYY-MM-DD string of today's calendar date in Nicaragua. */
export function todayNI(): string {
  // en-CA produces ISO-like YYYY-MM-DD regardless of locale settings.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NICARAGUA_TZ,
    year:  "numeric",
    month: "2-digit",
    day:   "2-digit",
  }).format(new Date());
}

/** YYYY-MM-DD of a date plus N days, computed against Nicaragua's calendar. */
export function addDaysNI(yyyymmdd: string, days: number): string {
  // Parse as noon UTC so the calendar day never spills into adjacent days in
  // any browser timezone, then add days, then re-extract the NI calendar day.
  const base = new Date(`${yyyymmdd}T12:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return "—";
  const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NICARAGUA_TZ,
    year:  "numeric",
    month: "2-digit",
    day:   "2-digit",
  }).format(shifted);
}

// ── Calendar-day Date helpers (for date pickers) ─────────────────────────

/**
 * Convert a YYYY-MM-DD string into a JS Date at noon UTC.
 * Noon UTC is noon in every browser tz, so the Date represents the same
 * calendar day regardless of where the user is. Use this whenever a Date
 * object is used purely as a calendar-day marker, never as a real instant.
 */
export function calendarDateNI(yyyymmdd: string): Date {
  const d = new Date(`${yyyymmdd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`calendarDateNI: invalid YYYY-MM-DD input "${yyyymmdd}"`);
  }
  return d;
}

/** Inverse of calendarDateNI: extract YYYY-MM-DD in Nicaragua's calendar. */
export function dateToCalendarNI(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NICARAGUA_TZ,
    year:  "numeric",
    month: "2-digit",
    day:   "2-digit",
  }).format(d);
}

/**
 * Convert a Date from a calendar widget (react-day-picker, FullCalendar's
 * dateClick, etc.) to YYYY-MM-DD using the BROWSER's local tz — matching what
 * the user saw and clicked on the widget.
 *
 * NEVER use `dateToCalendarNI` on Dates that came from a calendar widget:
 * those widgets construct Date objects at local midnight for each cell, so
 * interpreting them in NI tz can shift the day backward for users east of
 * Nicaragua (e.g. Australia: clicking "May 29" produces a Date that maps to
 * "May 28" in NI tz). Use this helper instead.
 */
export function dateToCalendarLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Convert a YYYY-MM-DD string into a JS Date at LOCAL midnight (the format
 * react-day-picker and similar widgets use for their internal Date comparisons).
 *
 * Use this — not `calendarDateNI` — when constructing `fromDate`/`toDate`/`month`
 * props for a calendar widget, or any Date value that will be compared against
 * the widget's own cell Dates. Otherwise the noon-UTC values produced by
 * `calendarDateNI` will mis-compare for users far east of Nicaragua, deshabilitando
 * o habilitando celdas en el día equivocado.
 */
export function calendarDateLocal(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) {
    throw new RangeError(`calendarDateLocal: invalid YYYY-MM-DD input "${yyyymmdd}"`);
  }
  return new Date(y, m - 1, d);
}

// ── Formatting (always in Nicaragua tz) ──────────────────────────────────

function parseInput(input: Date | string | null | undefined): Date | null {
  if (input == null) return null;
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** "miércoles, 27 de mayo de 2026" / "Wednesday, May 27, 2026" */
export function formatDateNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    weekday:  "long",
    day:      "numeric",
    month:    "long",
    year:     "numeric",
  }).format(d);
}

/** "27 may 2026" / "May 27, 2026" */
export function formatDateShortNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    day:      "numeric",
    month:    "short",
    year:     "numeric",
  }).format(d);
}

/** "lun., 27 abr. 2026" / "Mon, Apr 27, 2026" — short weekday + short month + year. */
export function formatDateWeekdayShortNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    weekday:  "short",
    day:      "numeric",
    month:    "short",
    year:     "numeric",
  }).format(d);
}

/** "27 de mayo de 2026" / "May 27, 2026" — long month, no weekday. */
export function formatDateLongNoWeekdayNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    day:      "numeric",
    month:    "long",
    year:     "numeric",
  }).format(d);
}

/**
 * "mayo 2026" / "May 2026" — month + year only. Accepts (year, month) where
 * month is 1-12 (calendar style), not 0-11 (JS Date style). Used by report
 * charts that bucket events by calendar month in Nicaragua.
 */
export function formatMonthYearNI(year: number, month: number, locale: Loc): string {
  // Use day=15 to avoid any DST/edge-of-month issues. Noon UTC for tz-safety.
  const d = new Date(Date.UTC(year, month - 1, 15, 12));
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    month:    "long",
    year:     "numeric",
  }).format(d);
}

/**
 * "08:00" (24h, no AM/PM). The `_locale` parameter is accepted for call-site
 * uniformity with the other format helpers but is intentionally unused —
 * 24-hour clock has no locale-dependent formatting.
 */
export function formatTimeNI(input: Date | string | null | undefined, _locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: NICARAGUA_TZ,
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  }).format(d);
}

/** "8:00 AM" (12h, no leading zero on hour) */
export function formatTime12NI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    hour:     "numeric",
    minute:   "2-digit",
    hour12:   true,
  }).format(d);
}

/** "miércoles, 27 de mayo de 2026, 8:00 a. m." / "Wednesday, May 27, 2026 at 8:00 AM" */
export function formatDateTimeNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone:  NICARAGUA_TZ,
    dateStyle: "full",
    timeStyle: "short",
  }).format(d);
}

/** "27 may, 08:00" / "May 27, 08:00" — compact for lists / notifications */
export function formatShortDateTimeNI(input: Date | string | null | undefined, locale: Loc): string {
  const d = parseInput(input);
  if (!d) return "—";
  const datePart = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: NICARAGUA_TZ,
    day:      "numeric",
    month:    "short",
  }).format(d);
  const timePart = formatTimeNI(d, locale);
  return `${datePart}, ${timePart}`;
}

// ── 24h booking cutoff ───────────────────────────────────────────────────

/**
 * Returns true if `citaInstant` is at least 24 hours away from now.
 * The check is timezone-independent (compares UTC instants).
 */
export function isAtLeast24hAway(citaInstant: Date | string | null | undefined): boolean {
  const d = parseInput(citaInstant);
  if (!d) return false;
  const cutoffMs = Date.now() + 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoffMs;
}
