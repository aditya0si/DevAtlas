/**
 * Shared Time Machine year constants and helpers.
 *
 * The backend validates the historical year filter with `ge=2008, le=2100`
 * (see the `year` query params in the India/geospatial routers), so the
 * frontend must never send a year outside that range. The default year tracks
 * the current calendar year instead of a hardcoded value so the UI never goes
 * stale.
 */

/** Minimum year the backend accepts for the historical year filter. */
export const MIN_SUPPORTED_YEAR = 2008;

/** Maximum year the backend accepts for the historical year filter. */
export const MAX_SUPPORTED_YEAR = 2100;

/** Earliest year shown on the Time Machine slider (preserves existing UI). */
export const MIN_SELECTABLE_YEAR = 2022;

/**
 * Current calendar year — the default Time Machine selection. A future
 * deployment in a later calendar year automatically defaults to that year.
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Upper bound for the Time Machine slider: the current year (no data exists
 * for future years) clamped to the backend-supported maximum.
 */
export function getMaxSelectableYear(): number {
  return Math.min(getCurrentYear(), MAX_SUPPORTED_YEAR);
}
