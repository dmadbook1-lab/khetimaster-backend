/**
 * Small geometry helpers so the advisory engine does not need @turf/*.
 * Formulas match turf's `area` (spherical ring area) and `convex`.
 */

const EARTH_RADIUS_M = 6378137;
const rad = (deg) => (deg * Math.PI) / 180;

function ringAreaM2(coords) {
  const n = coords.length;
  if (n <= 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    let lower;
    let middle;
    let upper;
    if (i === n - 2) {
      lower = n - 2;
      middle = n - 1;
      upper = 0;
    } else if (i === n - 1) {
      lower = n - 1;
      middle = 0;
      upper = 1;
    } else {
      lower = i;
      middle = i + 1;
      upper = i + 2;
    }
    total +=
      (rad(coords[upper][0]) - rad(coords[lower][0])) *
      Math.sin(rad(coords[middle][1]));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** Area in m² of a GeoJSON Polygon (outer ring minus holes). */
export function polygonAreaM2(geometry) {
  const rings = geometry?.coordinates;
  if (!Array.isArray(rings) || !rings.length) return 0;
  let area = ringAreaM2(rings[0]);
  for (let i = 1; i < rings.length; i++) area -= ringAreaM2(rings[i]);
  return area;
}

/** Convex hull (Andrew's monotone chain) of a GeoJSON Polygon; returns a closed Polygon. */
export function convexHullPolygon(geometry) {
  const pts = (geometry?.coordinates?.[0] || [])
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return null;

  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return null;
  hull.push([...hull[0]]);
  return { type: "Polygon", coordinates: [hull] };
}
