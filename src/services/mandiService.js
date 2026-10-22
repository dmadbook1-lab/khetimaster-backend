import axios from 'axios';

import MANDI_CROPS from '../data/mandiCrops.js';
import MANDI_STATES from '../data/mandiLocations.js';

/*
|--------------------------------------------------------------------------
| MANDI PRICE SERVICE (data.gov.in)
|--------------------------------------------------------------------------
|
| Two government datasets are used:
|
| DAILY       "Current Daily Price of Various Commodities from Various
|             Markets" - today's prices from every reporting market.
|             Used for the normal "latest prices" view.
|
| HISTORICAL  "Variety-wise Daily Market Prices Data of Commodity" - every
|             price since 2010 (millions of rows, unsorted unless asked).
|             Used for a specific date, and as a fallback when a crop has
|             no prices today.
|
| Things data.gov.in does that this service works around:
|
| - Commodity filters are a text search, not an exact match ("Kulthi
|   (Horse Gram)" also returns Bengal Gram). Records are filtered to the
|   crop's exact official names after fetching.
| - The API key decides the page size (the public sample key returns 10
|   rows), so the page size is read from the first response.
| - State spellings differ ("Keralam", "Chattisgarh"); see
|   data/mandiLocations.js aliases.
| - It is slow and sometimes fails. Results are cached in memory, and the
|   last good result is served if a refresh fails.
|
| The API key stays on the server (DATA_GOV_MANDI_API_KEY).
|
*/

const BASE_URL = 'https://api.data.gov.in/resource';

const DAILY_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';

const HISTORICAL_RESOURCE = '35985678-0d79-46b4-9ed6-6f13308a1d24';

const REQUEST_TIMEOUT_MS = 20000;

const MAX_PAGES = 10;

const PARALLEL_PAGES = 3;

// Waits before retrying a rate-limited / failed request
const RETRY_DELAYS_MS = [1000, 3000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * When falling back to the historical dataset, ignore prices older than
 * this many days before the newest one found.
 */
const HISTORICAL_WINDOW_DAYS = 30;

const pageSize = () => Number(process.env.MANDI_PAGE_SIZE) || 1000;

const cacheMinutes = () => Number(process.env.MANDI_CACHE_MINUTES) || 30;

export class MandiServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/*
|--------------------------------------------------------------------------
| NAME MATCHING
|--------------------------------------------------------------------------
*/

/*
 * "Ragi (Finger Millet)" and "ragi(finger millet)" -> "ragifingermillet"
 */
export const matchKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const VALID_CROP_TEXT = /^[\p{L}\p{N} ()/&.,'-]{2,60}$/u;

/*
 * Find a crop by id, name, official name or alias.
 *
 * Unknown names are still allowed (so new crops in the app work without
 * a backend change) and are matched against data.gov.in as typed.
 *
 * Returns null for empty or invalid input.
 */
export const resolveCrop = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const key = matchKey(raw);

  const crop = MANDI_CROPS.find((item) =>
    [item.id, item.name, item.commodity, ...item.commodities, ...(item.aliases || [])].some(
      (value) => matchKey(value) === key
    )
  );

  if (crop) return { ...crop, known: true };

  if (!VALID_CROP_TEXT.test(raw)) return null;

  return {
    id: null,
    name: raw,
    commodity: raw,
    commodities: [raw],
    aliases: [],
    category: null,
    known: false,
  };
};

/*
 * Find a state by id, name or alias. Returns the state with every
 * spelling data.gov.in may use, or null.
 */
export const resolveState = (input) => {
  const key = matchKey(input);
  if (!key) return null;

  const state = MANDI_STATES.find((item) =>
    [item.id, item.name, ...(item.aliases || [])].some((value) => matchKey(value) === key)
  );

  if (!state) return null;

  return {
    ...state,
    spellings: [state.name, ...(state.aliases || [])],
    keys: new Set([state.name, ...(state.aliases || [])].map(matchKey)),
  };
};

const commodityMatcher = (crop) => {
  const exact = new Set(crop.commodities.map(matchKey));

  return (records) => {
    const matched = records.filter((record) => exact.has(matchKey(record.commodity)));

    /*
     * An unknown crop name may not be an exact official name; keep
     * records whose commodity contains it instead.
     */
    if (matched.length === 0 && !crop.known) {
      const partial = matchKey(crop.name);
      return records.filter((record) => matchKey(record.commodity).includes(partial));
    }

    return matched;
  };
};

/*
|--------------------------------------------------------------------------
| DATES
|--------------------------------------------------------------------------
*/

/*
 * "22/10/2026" -> "2026-10-22"
 */
export const toIsoDate = (value) => {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

/*
 * "2026-10-22" or "22/10/2026" -> "22/10/2026", or null if invalid.
 */
export const toGovDate = (value) => {
  const text = String(value || '').trim();
  let day, month, year;

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    [, year, month, day] = match;
  } else {
    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    [, day, month, year] = match;
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) {
    return null;
  }

  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
};

/*
|--------------------------------------------------------------------------
| RECORDS
|--------------------------------------------------------------------------
*/

const toPrice = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
};

const toText = (value) =>
  value === undefined || value === null ? null : String(value).trim() || null;

/*
 * Both datasets in one shape. Prices are rupees per quintal.
 */
export const formatRecord = (record) => {
  const arrivalDate = toText(record.arrival_date ?? record.Arrival_Date);

  return {
    arrivalDate,
    arrivalDateISO: toIsoDate(arrivalDate),
    commodity: toText(record.commodity ?? record.Commodity),
    commodityCode: record.Commodity_Code ?? null,
    state: toText(record.state ?? record.State),
    district: toText(record.district ?? record.District),
    market: toText(record.market ?? record.Market),
    variety: toText(record.variety ?? record.Variety),
    grade: toText(record.grade ?? record.Grade),
    minPrice: toPrice(record.min_price ?? record.Min_Price),
    maxPrice: toPrice(record.max_price ?? record.Max_Price),
    modalPrice: toPrice(record.modal_price ?? record.Modal_Price),
    unit: 'Rs/Quintal',
  };
};

const recordKey = (record) =>
  [record.state, record.district, record.market, record.commodity, record.variety, record.grade]
    .map(matchKey)
    .join('|');

const dedupe = (records) => {
  const seen = new Map();

  for (const record of records) {
    const key = `${recordKey(record)}|${record.arrivalDateISO}`;
    if (!seen.has(key)) seen.set(key, record);
  }

  return [...seen.values()];
};

/*
 * Newest record per market / variety / grade.
 */
const latestPerMarket = (records) => {
  const latest = new Map();

  for (const record of records) {
    const key = recordKey(record);
    const current = latest.get(key);

    if (!current || (record.arrivalDateISO || '') > (current.arrivalDateISO || '')) {
      latest.set(key, record);
    }
  }

  return [...latest.values()];
};

/*
|--------------------------------------------------------------------------
| CACHE
|--------------------------------------------------------------------------
|
| In-memory, per server process. Concurrent requests for the same data
| share one upstream call. If a refresh fails, the last good value is
| returned with stale: true.
|
*/

const cache = new Map();

const MAX_CACHE_ENTRIES = 300;

const RETRY_AFTER_FAILURE_MS = 60 * 1000;

const cached = async (key, ttlMs, loader) => {
  const entry = cache.get(key);
  const now = Date.now();

  if (entry?.value && entry.expiresAt > now) return { ...entry.value, stale: false };
  if (entry?.pending) return entry.pending;

  const pending = loader()
    .then((value) => {
      cache.delete(key);
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });

      while (cache.size > MAX_CACHE_ENTRIES) {
        cache.delete(cache.keys().next().value);
      }

      return { ...value, stale: false };
    })
    .catch((error) => {
      if (entry?.value) {
        cache.set(key, { value: entry.value, expiresAt: Date.now() + RETRY_AFTER_FAILURE_MS });
        return { ...entry.value, stale: true };
      }

      cache.delete(key);
      throw error;
    });

  cache.set(key, { ...entry, pending });

  return pending;
};

export const clearMandiCache = () => cache.clear();

/*
|--------------------------------------------------------------------------
| UPSTREAM
|--------------------------------------------------------------------------
*/

const fetchPage = async (resource, params) => {
  const apiKey = process.env.DATA_GOV_MANDI_API_KEY;

  if (!apiKey) {
    throw new MandiServiceError(503, 'Mandi prices are not configured on the server');
  }

  let response;

  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await axios.get(`${BASE_URL}/${resource}`, {
        params: { 'api-key': apiKey, format: 'json', ...params },
        headers: { Accept: 'application/json' },
        timeout: REQUEST_TIMEOUT_MS,
      });

      break;
    } catch (error) {
      const status = error.response?.status;

      // Rate limited, server error or timeout: wait and try again
      const retryable = !status || status === 429 || status >= 500;

      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      console.error('data.gov.in request failed:', status || error.message);

      throw new MandiServiceError(
        502,
        'The government mandi price service is not responding. Please try again shortly.'
      );
    }
  }

  if (!response.data || !Array.isArray(response.data.records)) {
    console.error('data.gov.in unexpected response:', String(response.data).slice(0, 200));

    throw new MandiServiceError(502, 'Unexpected response from the government mandi service');
  }

  return response.data;
};

/*
 * Fetch every page of a query (up to MAX_PAGES). Pages after the first
 * that fail are skipped and the result is marked truncated.
 */
const fetchAll = async (resource, filters, maxPages = MAX_PAGES) => {
  const first = await fetchPage(resource, { ...filters, limit: pageSize(), offset: 0 });

  const records = [...first.records];
  const total = Number(first.total) || 0;
  const effectivePageSize = first.records.length;

  let truncated = false;

  if (effectivePageSize > 0) {
    const offsets = [];

    for (
      let offset = effectivePageSize;
      offset < total && offsets.length < maxPages - 1;
      offset += effectivePageSize
    ) {
      offsets.push(offset);
    }

    for (let i = 0; i < offsets.length; i += PARALLEL_PAGES) {
      const pages = await Promise.all(
        offsets
          .slice(i, i + PARALLEL_PAGES)
          .map((offset) =>
            fetchPage(resource, { ...filters, limit: pageSize(), offset }).catch(() => null)
          )
      );

      for (const page of pages) {
        if (page) records.push(...page.records);
        else truncated = true;
      }
    }

    if (records.length < total) truncated = true;
  }

  return { records, truncated, updatedAt: first.updated_date || null };
};

/*
|--------------------------------------------------------------------------
| PUBLIC FUNCTIONS
|--------------------------------------------------------------------------
*/

/*
 * Today's prices for a crop, all over India.
 *
 * Returns { records, truncated, updatedAt, fetchedAt, stale }.
 */
export const getDailyPrices = (crop) => {
  const names = [...new Set(crop.commodities)];

  return cached(
    `daily:${names.map(matchKey).sort().join(',')}`,
    cacheMinutes() * 60000,
    async () => {
      const results = [];

      for (const name of names) {
        results.push(await fetchAll(DAILY_RESOURCE, { 'filters[commodity]': name }));
      }

      const records = commodityMatcher(crop)(
        dedupe(results.flatMap((result) => result.records.map(formatRecord)))
      );

      return {
        records,
        truncated: results.some((result) => result.truncated),
        updatedAt: results[0]?.updatedAt || null,
        fetchedAt: new Date().toISOString(),
      };
    }
  );
};

/*
 * Most recent price per market from the historical dataset, for a crop
 * with no prices today. Optionally limited to one state.
 */
export const getLatestHistoricalPrices = (crop, state = null) => {
  const names = [...new Set(crop.commodities)];
  const spellings = state ? state.spellings : [null];

  return cached(
    `latest:${names.map(matchKey).sort().join(',')}:${state ? state.id : 'all'}`,
    cacheMinutes() * 4 * 60000,
    async () => {
      const raw = [];

      for (const name of names) {
        for (const spelling of spellings) {
          const page = await fetchPage(HISTORICAL_RESOURCE, {
            'filters[Commodity]': name,
            ...(spelling ? { 'filters[State]': spelling } : {}),
            'sort[Arrival_Date]': 'desc',
            limit: pageSize(),
            offset: 0,
          });

          raw.push(...page.records);
        }
      }

      const latest = latestPerMarket(commodityMatcher(crop)(raw.map(formatRecord)));

      const newest = latest.reduce(
        (max, record) => ((record.arrivalDateISO || '') > max ? record.arrivalDateISO : max),
        ''
      );

      const cutoff = newest
        ? new Date(Date.parse(newest) - HISTORICAL_WINDOW_DAYS * 86400000)
            .toISOString()
            .slice(0, 10)
        : '';

      return {
        records: latest.filter((record) => (record.arrivalDateISO || '') >= cutoff),
        truncated: false,
        updatedAt: null,
        fetchedAt: new Date().toISOString(),
      };
    }
  );
};

/*
 * Prices for a crop on one date (DD/MM/YYYY), optionally in one state.
 */
export const getPricesOnDate = (crop, govDate, state = null) => {
  const names = [...new Set(crop.commodities)];
  const spellings = state ? state.spellings : [null];

  return cached(
    `date:${names.map(matchKey).sort().join(',')}:${govDate}:${state ? state.id : 'all'}`,
    cacheMinutes() * 4 * 60000,
    async () => {
      const raw = [];
      let truncated = false;

      for (const name of names) {
        for (const spelling of spellings) {
          const result = await fetchAll(
            HISTORICAL_RESOURCE,
            {
              'filters[Commodity]': name,
              'filters[Arrival_Date]': govDate,
              ...(spelling ? { 'filters[State]': spelling } : {}),
            },
            5
          );

          raw.push(...result.records);
          truncated = truncated || result.truncated;
        }
      }

      const isoDate = toIsoDate(govDate);

      return {
        records: commodityMatcher(crop)(
          dedupe(raw.map(formatRecord)).filter((record) => record.arrivalDateISO === isoDate)
        ),
        truncated,
        updatedAt: null,
        fetchedAt: new Date().toISOString(),
      };
    }
  );
};

/*
 * Districts in a state that report mandi prices. Uses today's data, or
 * recent historical data if nothing was reported today.
 */
export const getStateDistricts = (state) =>
  cached(`districts:${state.id}`, 6 * 60 * 60000, async () => {
    const districts = new Set();

    for (const spelling of state.spellings) {
      const today = await fetchAll(DAILY_RESOURCE, { 'filters[state]': spelling }, 5);

      today.records
        .map(formatRecord)
        .filter((record) => state.keys.has(matchKey(record.state)))
        .forEach((record) => record.district && districts.add(record.district));
    }

    if (districts.size === 0) {
      for (const spelling of state.spellings) {
        const page = await fetchPage(HISTORICAL_RESOURCE, {
          'filters[State]': spelling,
          'sort[Arrival_Date]': 'desc',
          limit: pageSize(),
          offset: 0,
        });

        page.records
          .map(formatRecord)
          .forEach((record) => record.district && districts.add(record.district));
      }
    }

    return {
      districts: [...districts].sort((a, b) => a.localeCompare(b)),
      fetchedAt: new Date().toISOString(),
    };
  });
