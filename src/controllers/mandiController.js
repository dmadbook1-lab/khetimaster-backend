import axios from 'axios';

import MANDI_CROPS from '../data/mandiCrops.js';
import MANDI_STATES from '../data/mandiLocations.js';

const MANDI_API_URL =
  'https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const normalize = value =>
  String(value || '')
    .trim()
    .toLowerCase();

/*
|--------------------------------------------------------------------------
| Parse Indian Date
|--------------------------------------------------------------------------
|
| Government API returns:
|
| DD/MM/YYYY
|
*/

const parseIndianDate = dateString => {
  if (!dateString) {
    return 0;
  }

  const [day, month, year] =
    String(dateString)
      .trim()
      .split('/');

  if (!day || !month || !year) {
    return 0;
  }

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
  ).getTime();
};

/*
|--------------------------------------------------------------------------
| Format Mandi Record
|--------------------------------------------------------------------------
*/

const formatRecord = record => ({
  arrivalDate:
    record.Arrival_Date || null,

  commodity:
    record.Commodity || null,

  commodityCode:
    record.Commodity_Code || null,

  state:
    record.State || null,

  district:
    record.District || null,

  market:
    record.Market?.trim() || null,

  variety:
    record.Variety?.trim() || null,

  grade:
    record.Grade?.trim() || null,

  minPrice:
    record.Min_Price !== undefined
      ? Number(record.Min_Price)
      : null,

  maxPrice:
    record.Max_Price !== undefined
      ? Number(record.Max_Price)
      : null,

  modalPrice:
    record.Modal_Price !== undefined
      ? Number(record.Modal_Price)
      : null,
});

/*
|--------------------------------------------------------------------------
| GET MANDI CROPS
|--------------------------------------------------------------------------
|
| These crops are manually maintained in:
|
| data/mandiCrops.js
|
*/

export const getMandiCrops = async (
  req,
  res,
) => {
  try {
    return res.status(200).json({
      success: true,

      count:
        MANDI_CROPS.length,

      data:
        MANDI_CROPS,
    });
  } catch (error) {
    console.error(
      'Get mandi crops error:',
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        'Failed to fetch mandi crops',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MANDI STATES
|--------------------------------------------------------------------------
|
| Used by the temporary location selector
| on the Mandi Rates screen.
|
| This does NOT modify the user's profile.
|
*/

export const getMandiStates = async (
  req,
  res,
) => {
  try {
    return res.status(200).json({
      success: true,

      count:
        MANDI_STATES.length,

      data:
        MANDI_STATES,
    });
  } catch (error) {
    console.error(
      'Get mandi states error:',
      error,
    );

    return res.status(500).json({
      success: false,

      message:
        'Failed to fetch mandi states',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MANDI DISTRICTS
|--------------------------------------------------------------------------
|
| Example:
|
| GET /api/mandi/districts?state=Maharashtra
|
| The government API is queried using the
| selected state and the unique districts
| are extracted from the response.
|
*/

export const getMandiDistricts = async (
  req,
  res,
) => {
  try {
    const {
      state,
    } = req.query;

    /*
    |--------------------------------------------------------------------------
    | Validate State
    |--------------------------------------------------------------------------
    */

    if (!state) {
      return res.status(400).json({
        success: false,

        message:
          'State is required',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Validate State Against Our State List
    |--------------------------------------------------------------------------
    */

    const selectedState =
      MANDI_STATES.find(
        item =>
          normalize(item.name) ===
          normalize(state) ||
          normalize(item.id) ===
          normalize(state),
      );

    if (!selectedState) {
      return res.status(400).json({
        success: false,

        message:
          'Invalid state selected',

        availableStates:
          MANDI_STATES.map(
            item => item.name,
          ),
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Use Official State Name
    |--------------------------------------------------------------------------
    */

    const officialStateName =
      selectedState.name;

    console.log(
      'Fetching mandi districts:',
      officialStateName,
    );

    /*
    |--------------------------------------------------------------------------
    | Government API Request
    |--------------------------------------------------------------------------
    */

    const response =
      await axios.get(
        MANDI_API_URL,
        {
          params: {
            'api-key':
              process.env
                .DATA_GOV_MANDI_API_KEY,

            format: 'json',

            'filters[State]':
              officialStateName,

            limit: 1000,

            offset: 0,
          },

          headers: {
            Accept:
              'application/json',
          },

          timeout: 30000,
        },
      );

    /*
    |--------------------------------------------------------------------------
    | Extract Records
    |--------------------------------------------------------------------------
    */

    const records =
      response.data?.records || [];

    /*
    |--------------------------------------------------------------------------
    | Extract Unique Districts
    |--------------------------------------------------------------------------
    */

    const districts = [
      ...new Set(
        records
          .map(record =>
            String(
              record.District || '',
            ).trim(),
          )
          .filter(Boolean),
      ),
    ].sort((a, b) =>
      a.localeCompare(b),
    );

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      state:
        officialStateName,

      count:
        districts.length,

      data:
        districts,
    });
  } catch (error) {
    console.error(
      'Get mandi districts error:',
      error.response?.data ||
        error.message,
    );

    return res.status(
      error.response?.status || 500,
    ).json({
      success: false,

      message:
        error.response?.data?.message ||
        'Failed to fetch mandi districts',

      error:
        process.env.NODE_ENV ===
        'development'
          ? error.message
          : undefined,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MANDI RATES
|--------------------------------------------------------------------------
|
| Required:
|
| state
| district
| crop
|
| Optional:
|
| arrivalDate
| limit
|
*/

export const getMandiRates = async (
  req,
  res,
) => {
  try {
    const {
      state,
      district,
      crop,
      arrivalDate,
      limit = 50,
    } = req.query;

    /*
    |--------------------------------------------------------------------------
    | Validate State
    |--------------------------------------------------------------------------
    */

    if (!state) {
      return res.status(400).json({
        success: false,

        message:
          'State is required',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Validate District
    |--------------------------------------------------------------------------
    */

    if (!district) {
      return res.status(400).json({
        success: false,

        message:
          'District is required',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Crop
    |--------------------------------------------------------------------------
    */

    if (!crop) {
      return res.status(400).json({
        success: false,

        message:
          'Crop is required',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find Manually Maintained Crop
    |--------------------------------------------------------------------------
    */

    const selectedCrop =
      MANDI_CROPS.find(
        item =>
          normalize(item.id) ===
            normalize(crop) ||

          normalize(item.name) ===
            normalize(crop) ||

          normalize(
            item.commodity,
          ) === normalize(crop),
      );

    /*
    |--------------------------------------------------------------------------
    | Invalid Crop
    |--------------------------------------------------------------------------
    */

    if (!selectedCrop) {
      return res.status(400).json({
        success: false,

        message:
          'Invalid crop selected',

        availableCrops:
          MANDI_CROPS.map(
            item => item.name,
          ),
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Limit
    |--------------------------------------------------------------------------
    */

    const parsedLimit =
      Number(limit);

    if (
      !Number.isInteger(
        parsedLimit,
      ) ||
      parsedLimit < 1 ||
      parsedLimit > 100
    ) {
      return res.status(400).json({
        success: false,

        message:
          'Limit must be between 1 and 100',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Government API Filters
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | State
    | District
    | Commodity
    |
    | Taluka and Village are intentionally
    | NOT sent because the selected government
    | resource does not expose those fields.
    |
    */

    const filters = {
      'filters[State]':
        state,

      'filters[District]':
        district,

      'filters[Commodity]':
        selectedCrop.commodity,
    };

    /*
    |--------------------------------------------------------------------------
    | Optional Arrival Date
    |--------------------------------------------------------------------------
    */

    if (arrivalDate) {
      filters[
        'filters[Arrival_Date]'
      ] = arrivalDate;
    }

    /*
    |--------------------------------------------------------------------------
    | Logging
    |--------------------------------------------------------------------------
    */

    console.log(
      'Fetching mandi rates:',
      {
        state,
        district,

        commodity:
          selectedCrop.commodity,

        arrivalDate:
          arrivalDate || null,
      },
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 1
    | Get Total Matching Records
    |--------------------------------------------------------------------------
    */

    const countResponse =
      await axios.get(
        MANDI_API_URL,
        {
          params: {
            'api-key':
              process.env
                .DATA_GOV_MANDI_API_KEY,

            format: 'json',

            limit: 1,

            offset: 0,

            ...filters,
          },

          headers: {
            Accept:
              'application/json',
          },

          timeout: 30000,
        },
      );

    /*
    |--------------------------------------------------------------------------
    | Total Records
    |--------------------------------------------------------------------------
    */

    const totalRecords =
      Number(
        countResponse.data?.total,
      ) || 0;

    /*
    |--------------------------------------------------------------------------
    | No Records
    |--------------------------------------------------------------------------
    */

    if (totalRecords === 0) {
      return res.status(200).json({
        success: true,

        filters: {
          state,

          district,

          crop:
            selectedCrop.name,

          commodity:
            selectedCrop.commodity,

          arrivalDate:
            arrivalDate || null,
        },

        count: 0,

        total: 0,

        data: [],
      });
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 2
    | Calculate Latest Offset
    |--------------------------------------------------------------------------
    |
    | The government dataset isn't ordered
    | newest-first.
    |
    | Therefore we jump near the end.
    |
    */

    const latestOffset =
      Math.max(
        totalRecords -
          parsedLimit,

        0,
      );

    console.log(
      'Mandi pagination:',
      {
        totalRecords,

        latestOffset,

        limit:
          parsedLimit,
      },
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 3
    | Fetch Latest Records
    |--------------------------------------------------------------------------
    */

    const latestResponse =
      await axios.get(
        MANDI_API_URL,
        {
          params: {
            'api-key':
              process.env
                .DATA_GOV_MANDI_API_KEY,

            format: 'json',

            limit:
              parsedLimit,

            offset:
              latestOffset,

            ...filters,
          },

          headers: {
            Accept:
              'application/json',
          },

          timeout: 30000,
        },
      );

    /*
    |--------------------------------------------------------------------------
    | Extract Records
    |--------------------------------------------------------------------------
    */

    const records =
      latestResponse.data?.records ||
      [];

    /*
    |--------------------------------------------------------------------------
    | STEP 4
    | Sort Newest → Oldest
    |--------------------------------------------------------------------------
    */

    const sortedRecords =
      [...records].sort(
        (a, b) =>
          parseIndianDate(
            b.Arrival_Date,
          ) -
          parseIndianDate(
            a.Arrival_Date,
          ),
      );

    /*
    |--------------------------------------------------------------------------
    | STEP 5
    | Format Records
    |--------------------------------------------------------------------------
    */

    const formattedRecords =
      sortedRecords.map(
        formatRecord,
      );

    /*
    |--------------------------------------------------------------------------
    | FINAL RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      filters: {
        state,

        district,

        crop:
          selectedCrop.name,

        commodity:
          selectedCrop.commodity,

        arrivalDate:
          arrivalDate || null,
      },

      count:
        formattedRecords.length,

      total:
        totalRecords,

      data:
        formattedRecords,
    });
  } catch (error) {
    /*
    |--------------------------------------------------------------------------
    | ERROR HANDLING
    |--------------------------------------------------------------------------
    */

    console.error(
      'Mandi API error:',
      error.response?.data ||
        error.message,
    );

    return res.status(
      error.response?.status ||
        500,
    ).json({
      success: false,

      message:
        error.response?.data
          ?.message ||
        'Failed to fetch mandi rates',

      error:
        process.env.NODE_ENV ===
        'development'
          ? error.message
          : undefined,
    });
  }
};