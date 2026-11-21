/*
|--------------------------------------------------------------------------
| GEO HELPERS
|--------------------------------------------------------------------------
*/

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/*
 * {lat, lng} or null. Rejects anything outside valid ranges.
 */
export const parsePoint = (value) => {
  if (!value || typeof value !== 'object') return null;

  const lat = Number(value.lat ?? value.latitude);
  const lng = Number(value.lng ?? value.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
};

/*
 * Straight-line distance in km between two {lat, lng} points.
 */
export const haversineKm = (from, to) => {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
};

export const roundKm = (km) => Math.round(km * 10) / 10;
