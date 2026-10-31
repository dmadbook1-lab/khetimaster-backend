import axios from "axios";

/**
 * Open-Meteo weather client for the advisory engine.
 *
 * Returns payloads in the same shape the CropGen engine expects from its
 * Observearth client (`{ current }`, `{ forecast }`, `{ daily }`) so the
 * weather, GDD and irrigation modules run unchanged — but needs no API key
 * and no per-farm AOI registration, only the field centroid.
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const TIMEOUT_MS = Number(process.env.WEATHER_TIMEOUT_MS) || 15_000;
/** Open-Meteo forecast endpoint serves at most 92 past days. */
const MAX_PAST_DAYS = 92;

const http = axios.create({ timeout: TIMEOUT_MS });

const CURRENT_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "rain",
  "cloud_cover",
  "wind_speed_10m",
  "wind_gusts_10m",
  "soil_temperature_0cm",
  "soil_temperature_6cm",
  "soil_moisture_0_to_1cm",
  "soil_moisture_3_to_9cm",
  "soil_moisture_9_to_27cm",
];

const DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "temperature_2m_mean",
  "precipitation_sum",
  "precipitation_probability_max",
  "relative_humidity_2m_mean",
  "et0_fao_evapotranspiration",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "cloud_cover_mean",
  "weather_code",
];

const todayISO = () => new Date().toISOString().slice(0, 10);

function daysBetween(startISO, endISO) {
  const ms = new Date(endISO) - new Date(startISO);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : 0;
}

function assertLocation(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Weather location (lat/lng) is required");
  }
  return { lat, lng };
}

async function fetchForecastRaw(location, pastDays = 0) {
  const { lat, lng } = assertLocation(location);
  const { data } = await http.get(FORECAST_URL, {
    params: {
      latitude: lat,
      longitude: lng,
      current: CURRENT_VARS.join(","),
      daily: DAILY_VARS.join(","),
      hourly: "et0_fao_evapotranspiration",
      past_days: Math.min(MAX_PAST_DAYS, Math.max(0, pastDays)),
      forecast_days: 8,
      timezone: "auto",
    },
  });
  return data;
}

function mapCurrent(raw) {
  const c = raw?.current || {};
  const today = todayISO();
  const hourlyTimes = raw?.hourly?.time || [];
  const hourlyEt0 = raw?.hourly?.et0_fao_evapotranspiration || [];
  const et0Today = hourlyTimes.reduce(
    (sum, t, i) => (String(t).startsWith(today) ? sum + (Number(hourlyEt0[i]) || 0) : sum),
    0,
  );

  return {
    current: {
      time: c.time,
      temp: c.temperature_2m,
      apparent_temperature: c.apparent_temperature,
      relative_humidity: c.relative_humidity_2m,
      precipitation: c.precipitation,
      rain: c.rain,
      cloud_cover: c.cloud_cover,
      wind_speed: c.wind_speed_10m,
      wind_gusts: c.wind_gusts_10m,
      et0_fao_evapotranspiration: Number(et0Today.toFixed(2)),
      soil_temperature_surface: c.soil_temperature_0cm,
      soil_temperature_6cm: c.soil_temperature_6cm,
      soil_moisture_surface: c.soil_moisture_0_to_1cm,
      soil_moisture_5cm: c.soil_moisture_3_to_9cm,
      soil_moisture_15cm: c.soil_moisture_9_to_27cm,
    },
  };
}

/** Split Open-Meteo daily arrays into past (historical) and today-onward (forecast). */
function splitDaily(raw) {
  const d = raw?.daily || {};
  const time = d.time || [];
  const today = todayISO();
  const firstFuture = time.findIndex((t) => t >= today);
  const cut = firstFuture === -1 ? time.length : firstFuture;
  const pick = (arr, from, to) => (Array.isArray(arr) ? arr.slice(from, to) : []);

  const slice = (from, to) => ({
    time: pick(time, from, to),
    temp_max: pick(d.temperature_2m_max, from, to),
    temp_min: pick(d.temperature_2m_min, from, to),
    temp_mean: pick(d.temperature_2m_mean, from, to),
    precipitation: pick(d.precipitation_sum, from, to),
    precipitation_probability: pick(d.precipitation_probability_max, from, to),
    relative_humidity: pick(d.relative_humidity_2m_mean, from, to),
    evapotranspiration: pick(d.et0_fao_evapotranspiration, from, to),
    wind_speed: pick(d.wind_speed_10m_max, from, to),
    wind_gusts: pick(d.wind_gusts_10m_max, from, to),
    cloud_cover: pick(d.cloud_cover_mean, from, to),
    weather_code: pick(d.weather_code, from, to),
  });

  return { past: slice(0, cut), future: slice(cut, time.length) };
}

async function fetchArchiveDaily(location, startDate, endDate) {
  const { lat, lng } = assertLocation(location);
  const { data } = await http.get(ARCHIVE_URL, {
    params: {
      latitude: lat,
      longitude: lng,
      start_date: startDate,
      end_date: endDate,
      daily: "temperature_2m_max,temperature_2m_min",
      timezone: "auto",
    },
  });
  return {
    time: data?.daily?.time || [],
    temp_max: data?.daily?.temperature_2m_max || [],
    temp_min: data?.daily?.temperature_2m_min || [],
  };
}

export async function getCurrentWeather(location) {
  return mapCurrent(await fetchForecastRaw(location, 0));
}

export async function getForecastWeather(location) {
  const { future } = splitDaily(await fetchForecastRaw(location, 0));
  return { forecast: future };
}

/** Current conditions + 7-day forecast in one call (used by the app's soil/weather card). */
export async function getFieldConditions(location) {
  const raw = await fetchForecastRaw(location, 0);
  return {
    ...mapCurrent(raw),
    forecast: splitDaily(raw).future,
    timezone: raw?.timezone ?? null,
  };
}

/**
 * Current + forecast + historical daily series (sowing → today) for GDD.
 * Same return contract as CropGen's Observearth `fetchWeatherBundle`.
 */
export async function fetchWeatherBundle(
  location,
  startDate,
  endDate,
  { onProgress } = {},
) {
  const log = (msg) => onProgress?.(msg);
  const end = endDate || todayISO();
  const totalPastDays = daysBetween(startDate, end);

  log(`forecast + ${Math.min(totalPastDays, MAX_PAST_DAYS)} past days`);
  const raw = await fetchForecastRaw(location, totalPastDays);
  const { past, future } = splitDaily(raw);

  let historical = { time: past.time, temp_max: past.temp_max, temp_min: past.temp_min };
  let historicalError = null;

  if (totalPastDays > MAX_PAST_DAYS && past.time.length) {
    const archiveEnd = new Date(past.time[0]);
    archiveEnd.setDate(archiveEnd.getDate() - 1);
    const archiveEndISO = archiveEnd.toISOString().slice(0, 10);
    log(`archive ${startDate}→${archiveEndISO}`);
    try {
      const older = await fetchArchiveDaily(location, startDate, archiveEndISO);
      historical = {
        time: [...older.time, ...historical.time],
        temp_max: [...older.temp_max, ...historical.temp_max],
        temp_min: [...older.temp_min, ...historical.temp_min],
      };
    } catch (err) {
      historicalError = err;
      log(`archive failed: ${err?.message || err}`);
    }
  }

  const hasHistory = historical.time.length > 0;
  return {
    currentWeatherResp: mapCurrent(raw),
    forecastWeather: { forecast: future },
    historicalWeather: hasHistory ? { daily: historical } : null,
    historicalError: hasHistory ? historicalError : historicalError || new Error("No historical weather"),
    historicalWindowDays: historical.time.length || null,
  };
}
