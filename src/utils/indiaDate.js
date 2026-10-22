/*
|--------------------------------------------------------------------------
| INDIA CALENDAR DAYS
|--------------------------------------------------------------------------
|
| Booking dates are whole days in Indian time. They are stored as UTC
| midnight of the Indian calendar date so the same day always compares
| equal, whatever format the app sends:
|
|   "2026-10-25"                -> 2026-10-25T00:00:00Z
|   "2026-10-24T18:30:00Z"      -> 2026-10-25T00:00:00Z (midnight IST)
|
*/

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/*
 * Returns the Indian calendar day as a Date, null for empty input, or an
 * invalid Date for unparseable input.
 */
export const toIndianDay = (value) => {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = value.trim().split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : new Date(NaN);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return date;

  const indian = new Date(date.getTime() + IST_OFFSET_MS);

  return new Date(Date.UTC(indian.getUTCFullYear(), indian.getUTCMonth(), indian.getUTCDate()));
};

export const todayInIndia = () => toIndianDay(new Date());

export const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

/*
 * Minutes since midnight right now, Indian time.
 */
export const nowMinutesInIndia = () => Math.floor(((Date.now() + IST_OFFSET_MS) % DAY_MS) / 60000);
