/*
|--------------------------------------------------------------------------
| TIME OF DAY
|--------------------------------------------------------------------------
|
| Booking times are stored as the text the app sent ("08:00", "8:00 AM")
| and converted to minutes since midnight for calculations.
|
*/

export const MINUTES_PER_DAY = 24 * 60;

/*
 * "09:30", "9:30", "9:30 AM", "9 AM" -> minutes since midnight, or null.
 */
export const parseTime = (value) => {
  const match = String(value)
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const period = match[3];

  if (match[2] === undefined && !period) return null;
  if (minutes > 59) return null;

  if (period) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (period === 'PM' ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

/*
 * 1050 -> "17:30"
 */
export const formatTime = (minutes) => {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = Math.round(minutes % 60);

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};
