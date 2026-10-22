import MANDI_CROPS from '../data/mandiCrops.js';
import MANDI_STATES from '../data/mandiLocations.js';

import {
  MandiServiceError,
  matchKey,
  resolveCrop,
  resolveState,
  toGovDate,
  getDailyPrices,
  getLatestHistoricalPrices,
  getPricesOnDate,
  getStateDistricts,
} from '../services/mandiService.js';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const sendError = (res, error, fallbackMessage) => {
  if (error instanceof MandiServiceError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(fallbackMessage, error);

  return res.status(500).json({ success: false, message: fallbackMessage });
};

const invalidState = (res) =>
  res.status(400).json({
    success: false,
    message: 'Invalid state selected',
    availableStates: MANDI_STATES.map((item) => item.name),
  });

const SORTS = {
  // state, district, market A-Z (default)
  location: (a, b) =>
    (a.state || '').localeCompare(b.state || '') ||
    (a.district || '').localeCompare(b.district || '') ||
    (a.market || '').localeCompare(b.market || ''),

  price_desc: (a, b) => (b.modalPrice ?? -1) - (a.modalPrice ?? -1),

  price_asc: (a, b) => (a.modalPrice ?? Infinity) - (b.modalPrice ?? Infinity),

  market: (a, b) => (a.market || '').localeCompare(b.market || ''),

  newest: (a, b) => (b.arrivalDateISO || '').localeCompare(a.arrivalDateISO || ''),
};

/*
 * Price overview of the matching markets (rupees per quintal).
 */
const summarize = (records) => {
  const priced = records.filter((record) => Number.isFinite(record.modalPrice));

  if (priced.length === 0) {
    return {
      markets: records.length,
      averageModalPrice: null,
      lowestModal: null,
      highestModal: null,
      minPrice: null,
      maxPrice: null,
      latestArrivalDate: null,
    };
  }

  const byModal = [...priced].sort(SORTS.price_asc);
  const pick = (record) => ({
    market: record.market,
    district: record.district,
    state: record.state,
    modalPrice: record.modalPrice,
  });

  const mins = records.map((record) => record.minPrice).filter(Number.isFinite);
  const maxes = records.map((record) => record.maxPrice).filter(Number.isFinite);

  const latest = records.reduce(
    (best, record) =>
      (record.arrivalDateISO || '') > (best?.arrivalDateISO || '') ? record : best,
    null
  );

  return {
    markets: records.length,
    averageModalPrice: Math.round(
      priced.reduce((sum, record) => sum + record.modalPrice, 0) / priced.length
    ),
    lowestModal: pick(byModal[0]),
    highestModal: pick(byModal[byModal.length - 1]),
    minPrice: mins.length ? Math.min(...mins) : null,
    maxPrice: maxes.length ? Math.max(...maxes) : null,
    latestArrivalDate: latest?.arrivalDate || null,
  };
};

/*
|--------------------------------------------------------------------------
| GET MANDI CROPS
|--------------------------------------------------------------------------
| GET /api/mandi/crops
|
| Supported crops with their official data.gov.in names and aliases
| (data/mandiCrops.js). Any other crop name can still be sent to /rates.
|--------------------------------------------------------------------------
*/

export const getMandiCrops = async (req, res) => {
  return res.status(200).json({
    success: true,
    count: MANDI_CROPS.length,
    data: MANDI_CROPS,
  });
};

/*
|--------------------------------------------------------------------------
| GET MANDI STATES
|--------------------------------------------------------------------------
| GET /api/mandi/states
|
| For the location selector on the Mandi Rates screen. Does not modify
| the user's profile.
|--------------------------------------------------------------------------
*/

export const getMandiStates = async (req, res) => {
  return res.status(200).json({
    success: true,
    count: MANDI_STATES.length,
    data: MANDI_STATES,
  });
};

/*
|--------------------------------------------------------------------------
| GET MANDI DISTRICTS
|--------------------------------------------------------------------------
| GET /api/mandi/districts?state=Maharashtra
| GET /api/mandi/districts?state=Maharashtra&crop=onion
|
| Districts that report mandi prices. With crop: only districts that have
| today's prices for that crop.
|--------------------------------------------------------------------------
*/

export const getMandiDistricts = async (req, res) => {
  try {
    const { state, crop } = req.query;

    if (!state) {
      return res.status(400).json({ success: false, message: 'State is required' });
    }

    const selectedState = resolveState(state);
    if (!selectedState) return invalidState(res);

    let districts;
    let stale = false;

    if (crop) {
      const selectedCrop = resolveCrop(crop);

      if (!selectedCrop) {
        return res.status(400).json({ success: false, message: 'Invalid crop selected' });
      }

      const daily = await getDailyPrices(selectedCrop);
      stale = daily.stale;

      districts = [
        ...new Set(
          daily.records
            .filter((record) => selectedState.keys.has(matchKey(record.state)))
            .map((record) => record.district)
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b));
    } else {
      const result = await getStateDistricts(selectedState);
      districts = result.districts;
      stale = result.stale;
    }

    return res.status(200).json({
      success: true,
      state: selectedState.name,
      count: districts.length,
      stale,
      data: districts,
    });
  } catch (error) {
    return sendError(res, error, 'Failed to fetch mandi districts');
  }
};

/*
|--------------------------------------------------------------------------
| GET MANDI RATES
|--------------------------------------------------------------------------
| GET /api/mandi/rates?crop=onion
|
| Required:
|   crop         id, name, official name or alias (see /crops); any other
|                name is searched as typed
|
| Optional:
|   state        name, id or alias ("Kerala" also finds "Keralam")
|   district
|   market       part of the market name
|   variety      part of the variety name
|   arrivalDate  YYYY-MM-DD or DD/MM/YYYY - prices on that date
|   sort         location (default) | price_desc | price_asc | market | newest
|   page, limit  default 1 / 50, limit max 200
|
| Without arrivalDate, today's prices are returned. If the crop has no
| prices today for the chosen location, the most recent price of each
| market (last 30 days) is returned instead, with source
| "historical_latest".
|
| Prices are rupees per quintal.
|--------------------------------------------------------------------------
*/

export const getMandiRates = async (req, res) => {
  try {
    const { crop, state, district, market, variety, arrivalDate, sort } = req.query;

    /* CROP */

    if (!crop) {
      return res.status(400).json({ success: false, message: 'Crop is required' });
    }

    const selectedCrop = resolveCrop(crop);

    if (!selectedCrop) {
      return res.status(400).json({
        success: false,
        message: 'Invalid crop selected',
        availableCrops: MANDI_CROPS.map((item) => item.name),
      });
    }

    /* STATE */

    let selectedState = null;

    if (state) {
      selectedState = resolveState(state);
      if (!selectedState) return invalidState(res);
    }

    /* DATE */

    let govDate = null;

    if (arrivalDate) {
      govDate = toGovDate(arrivalDate);

      if (!govDate) {
        return res.status(400).json({
          success: false,
          message: 'Arrival date must be YYYY-MM-DD or DD/MM/YYYY',
        });
      }
    }

    /* PAGING */

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    /* FETCH + FILTER */

    const districtKey = matchKey(district);
    const marketKey = matchKey(market);
    const varietyKey = matchKey(variety);

    const applyFilters = (records) =>
      records.filter(
        (record) =>
          (!selectedState || selectedState.keys.has(matchKey(record.state))) &&
          (!districtKey || matchKey(record.district) === districtKey) &&
          (!marketKey || matchKey(record.market).includes(marketKey)) &&
          (!varietyKey || matchKey(record.variety).includes(varietyKey))
      );

    let source;
    let result;
    let records;

    if (govDate) {
      source = 'historical';
      result = await getPricesOnDate(selectedCrop, govDate, selectedState);
      records = applyFilters(result.records);
    } else {
      source = 'daily';
      result = await getDailyPrices(selectedCrop);
      records = applyFilters(result.records);

      if (records.length === 0) {
        source = 'historical_latest';
        result = await getLatestHistoricalPrices(selectedCrop, selectedState);
        records = applyFilters(result.records);
      }
    }

    records.sort(SORTS[sort] || SORTS.location);

    const total = records.length;
    const data = records.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      success: true,

      filters: {
        crop: selectedCrop.name,
        cropId: selectedCrop.id,
        commodity: selectedCrop.commodity,
        commodities: selectedCrop.commodities,
        state: selectedState?.name || null,
        district: district || null,
        market: market || null,
        variety: variety || null,
        arrivalDate: govDate,
        sort: SORTS[sort] ? sort : 'location',
      },

      // daily | historical_latest | historical
      source,
      fetchedAt: result.fetchedAt,
      // true when data.gov.in failed and an older cached copy is shown
      stale: result.stale,
      // true when data.gov.in had more rows than were fetched
      truncated: result.truncated,

      summary: summarize(records),

      count: data.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data,
    });
  } catch (error) {
    return sendError(res, error, 'Failed to fetch mandi rates');
  }
};
