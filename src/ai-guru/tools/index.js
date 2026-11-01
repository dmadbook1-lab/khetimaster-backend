import mongoose from 'mongoose';
import { tool } from '@openai/agents';
import { z } from 'zod';

import FarmField from '../../models/farmField.model.js';
import Labourer from '../../models/Labourer.js';
import Machinery from '../../models/Machinery.js';
import Doctor from '../../models/Doctor.js';
import Plant from '../../models/Plant.js';
import MarketListing from '../../models/MarketListing.js';
import LabourBooking from '../../models/LabourBooking.js';
import MachineryBooking from '../../models/MachineryBooking.js';
import DoctorConsultation from '../../models/DoctorConsultation.js';
import NurseryOrder from '../../models/NurseryOrder.js';
import MarketDeal from '../../models/MarketDeal.js';
import { LISTING_KINDS } from '../../data/marketCategories.js';
import { getLatestAdvisory } from '../../advisory/services/advisory.service.js';
import { getFieldConditions } from '../../advisory/client/weather.client.js';
import { fieldCentroid } from '../../advisory/core/geometry/farmGeometry.js';
import { getLatestArticles } from '../../services/articleService.js';
import {
  resolveCrop,
  resolveState,
  getDailyPrices,
  getLatestHistoricalPrices,
} from '../../services/mandiService.js';
import { APP_SCREENS, APP_SCREEN_KEYS } from './appScreens.js';

/*
|--------------------------------------------------------------------------
| AI GURU TOOLS
|--------------------------------------------------------------------------
|
| Every tool reads the run context ({ userId, user, actions }) so a farmer
| can only ever see their own farms, bookings and orders. Results are
| compact JSON strings — just what the model needs to answer.
|
*/

const MAX_RESULTS = 6;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containsText = (value) => new RegExp(escapeRegex(String(value).trim()), 'i');

const exactText = (value) => new RegExp(`^${escapeRegex(String(value).trim())}$`, 'i');

const json = (value) => JSON.stringify(value);

const ctx = (runContext) => runContext?.context || {};

const daysSince = (dateText) => {
  const time = Date.parse(dateText);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
};

const MAX_ACTIONS = 3;

/*
 * Adds an in-app button under the reply. Search tools call this themselves
 * so the farmer always gets a shortcut, even when the model forgets to
 * call open_app_screen. Returns false when the button limit is reached.
 */
function suggestScreen(context, screen, label, params = {}) {
  if (!Array.isArray(context.actions)) context.actions = [];

  const key = JSON.stringify([screen, params]);
  if (context.actions.some((action) => JSON.stringify([action.screen, action.params]) === key)) {
    return true;
  }

  if (context.actions.length >= MAX_ACTIONS) return false;

  context.actions.push({ screen, label: String(label).slice(0, 40), params });
  return true;
}

/*
 * Button for the best search result, plus one for the full list screen.
 */
function suggestResults(context, results, { detail, list, listLabel, idParam, name }) {
  if (results.length) {
    suggestScreen(context, detail, `View ${name(results[0])}`, {
      [idParam]: String(results[0]._id),
    });
  }
  suggestScreen(context, list, listLabel);
}

/*
 * Location filter for district / state, defaulting to the farmer's own
 * district when nothing was asked for.
 */
function locationFilter(context, { district, state }, prefix = '') {
  const filter = {};
  const wantedDistrict = district || (!state ? context.user?.district : null);
  const wantedState = state || (!district ? context.user?.state : null);

  if (wantedDistrict) filter[`${prefix}district`] = exactText(wantedDistrict);
  else if (wantedState) filter[`${prefix}state`] = exactText(wantedState);

  return {
    filter,
    searchedIn: wantedDistrict || wantedState || 'all of India',
  };
}

/*
 * Runs a location-scoped search; when the farmer's area has nothing,
 * widens to the state, then to everywhere.
 */
async function findNearby(context, args, prefix, runQuery) {
  const { filter, searchedIn } = locationFilter(context, args, prefix);
  let results = await runQuery(filter);

  if (results.length || (!args.district && !args.state && !context.user?.district)) {
    return { results, searchedIn };
  }

  const state = args.state || context.user?.state;

  if (state && (args.district || context.user?.district)) {
    results = await runQuery({ [`${prefix}state`]: exactText(state) });
    if (results.length) return { results, searchedIn: `${state} (nothing in ${searchedIn})` };
  }

  results = await runQuery({});
  return { results, searchedIn: `all areas (nothing in ${searchedIn})` };
}

async function findOwnFarm(context, fieldId) {
  if (!fieldId || !mongoose.isValidObjectId(fieldId)) return null;
  return FarmField.findOne({ _id: fieldId, user: context.userId }).lean();
}

function compactAdvisory(advisory) {
  if (!advisory) return null;

  const growth = advisory.plantGrowthActivity || {};
  const npk = advisory.npkManagement || {};

  return {
    generatedAt: advisory.createdAt,
    cropHealth: advisory.cropHealth || null,
    growthStage: {
      stageName: growth.stageName,
      bbchStage: growth.bbchStage,
      cropAgeDays: growth.cropAgeDays,
      overallProgressPercent: growth.overallProgress,
      description: growth.description,
    },
    yield: advisory.yield || null,
    npk: {
      required: npk.required ?? npk.requiredNutrients ?? undefined,
      available: npk.available ?? npk.availableNutrients ?? undefined,
      recommendation: npk.recommendation ?? npk.summary ?? undefined,
    },
    activitiesToDo: (advisory.activitiesToDo || []).map((activity) => ({
      type: activity.type,
      title: activity.title,
      message: activity.message,
      progress: activity.progress,
    })),
    weatherAtGeneration: advisory.weatherSnapshot || null,
  };
}

/*
|--------------------------------------------------------------------------
| FARMS & ADVISORY
|--------------------------------------------------------------------------
*/

const getMyFarmsTool = tool({
  name: 'get_my_farms',
  description:
    "List the farmer's mapped farms with crop, variety, sowing date, crop age, area, irrigation and farming type, plus a short summary of each farm's latest smart advisory (crop health and growth stage).",
  parameters: z.object({}),
  async execute(_args, runContext) {
    const context = ctx(runContext);
    const farms = await FarmField.find({ user: context.userId })
      .select('-field')
      .sort({ createdAt: -1 })
      .lean();

    if (!farms.length) {
      suggestScreen(context, 'add_farm', 'Add your farm');
      return json({ farms: [], note: 'No farms mapped yet. Suggest adding one.' });
    }

    const rows = await Promise.all(
      farms.map(async (farm) => {
        const advisory = await getLatestAdvisory(farm._id);
        return {
          fieldId: String(farm._id),
          name: farm.fieldName,
          crop: farm.isBarrenLand ? 'barren / fallow land' : farm.cropName,
          variety: farm.variety,
          sowingDate: farm.sowingDate,
          cropAgeDays: daysSince(farm.sowingDate),
          acre: farm.acre,
          irrigation: farm.typeOfIrrigation,
          farmingType: farm.typeOfFarming,
          cropHealth: advisory?.cropHealth?.category || null,
          growthStage: advisory?.plantGrowthActivity?.stageName || null,
          pendingActivities: (advisory?.activitiesToDo || [])
            .filter((activity) => activity.progress !== 'completed')
            .map((activity) => activity.title),
        };
      })
    );

    return json({ farms: rows });
  },
});

const getFarmAdvisoryTool = tool({
  name: 'get_farm_advisory',
  description:
    "Get the latest KhetiMaster smart advisory for one of the farmer's farms: satellite crop health, growth stage, crop age, NPK needs, expected yield, and the to-do activities (irrigation, spray, fertigation, crop risk).",
  parameters: z.object({
    fieldId: z.string().describe('The farm id from get_my_farms or the system prompt.'),
  }),
  async execute({ fieldId }, runContext) {
    const context = ctx(runContext);
    const farm = await findOwnFarm(context, fieldId);

    if (!farm) return json({ found: false, note: 'Farm not found for this farmer.' });

    const advisory = await getLatestAdvisory(farm._id);

    suggestScreen(context, 'farm_overview', `Open ${farm.fieldName}`, {
      fieldId: String(farm._id),
    });

    return json({
      found: true,
      farm: {
        name: farm.fieldName,
        crop: farm.isBarrenLand ? 'barren / fallow land' : farm.cropName,
        variety: farm.variety,
        sowingDate: farm.sowingDate,
        cropAgeDays: daysSince(farm.sowingDate),
        acre: farm.acre,
        irrigation: farm.typeOfIrrigation,
        farmingType: farm.typeOfFarming,
      },
      advisory:
        compactAdvisory(advisory) ||
        'No advisory generated yet. It is created when the farmer opens the farm in the app; answer from crop age and general agronomy.',
    });
  },
});

const getWeatherTool = tool({
  name: 'get_weather',
  description:
    "Current weather and the 7-day forecast (rain, temperature, humidity, wind) at one of the farmer's farms. Use before advising irrigation, spraying, sowing or harvesting.",
  parameters: z.object({
    fieldId: z.string().nullable().describe("Farm id. Null to use the farmer's first farm."),
  }),
  async execute({ fieldId }, runContext) {
    const context = ctx(runContext);
    let farm = await findOwnFarm(context, fieldId);

    if (!farm) {
      farm = await FarmField.findOne({ user: context.userId }).sort({ createdAt: -1 }).lean();
    }

    if (!farm?.field?.length) {
      return json({
        available: false,
        note: 'Weather needs a mapped farm location. Suggest adding a farm, or the weather screen.',
      });
    }

    try {
      const conditions = await getFieldConditions(fieldCentroid(farm.field));
      return json({ available: true, farm: farm.fieldName, ...conditions });
    } catch (error) {
      console.error('[AI Guru] weather tool failed:', error.message);
      return json({ available: false, note: 'Weather service is not reachable right now.' });
    }
  },
});

/*
|--------------------------------------------------------------------------
| MANDI PRICES
|--------------------------------------------------------------------------
*/

const getMandiPricesTool = tool({
  name: 'get_mandi_prices',
  description:
    'Latest mandi (APMC market) prices for a crop in ₹ per quintal from data.gov.in, nearest markets first. Use for any crop price / bhav / selling question.',
  parameters: z.object({
    crop: z.string().describe('Crop / commodity name, e.g. "Onion", "Soybean", "Tur".'),
    state: z
      .string()
      .nullable()
      .describe("Indian state to filter by. Null to use the farmer's state."),
  }),
  async execute({ crop, state }, runContext) {
    const context = ctx(runContext);
    const resolvedCrop = resolveCrop(crop);

    if (!resolvedCrop) return json({ found: false, note: `Unknown crop "${crop}".` });

    const resolvedState = resolveState(state || context.user?.state || '');

    try {
      let { records } = await getDailyPrices(resolvedCrop);
      let dataset = 'today';

      if (resolvedState) {
        const spellings = resolvedState.spellings.map((name) => name.toLowerCase());
        const inState = records.filter((record) =>
          spellings.includes(String(record.state).toLowerCase())
        );
        if (inState.length) records = inState;
      }

      if (!records.length) {
        ({ records } = await getLatestHistoricalPrices(resolvedCrop, resolvedState));
        dataset = 'latest available days';
      }

      if (!records.length) {
        return json({ found: false, crop: resolvedCrop.name, note: 'No recent mandi prices.' });
      }

      const district = String(context.user?.district || '').toLowerCase();
      const sorted = [...records].sort(
        (a, b) =>
          (String(b.district).toLowerCase() === district) -
            (String(a.district).toLowerCase() === district) ||
          (b.arrivalDateISO || '').localeCompare(a.arrivalDateISO || '')
      );
      const modal = records.map((record) => record.modalPrice).filter(Number.isFinite);

      if (resolvedCrop.id) {
        suggestScreen(context, 'mandi_crop', `${resolvedCrop.name} prices`, {
          cropName: resolvedCrop.name,
          cropId: resolvedCrop.id,
        });
      } else {
        suggestScreen(context, 'mandi', 'Mandi prices');
      }

      return json({
        found: true,
        crop: resolvedCrop.name,
        cropId: resolvedCrop.id,
        dataset,
        unit: '₹ per quintal',
        marketsFound: records.length,
        averageModalPrice: modal.length
          ? Math.round(modal.reduce((sum, value) => sum + value, 0) / modal.length)
          : null,
        highestModalPrice: modal.length ? Math.max(...modal) : null,
        lowestModalPrice: modal.length ? Math.min(...modal) : null,
        markets: sorted.slice(0, 8).map((record) => ({
          market: record.market,
          district: record.district,
          state: record.state,
          variety: record.variety,
          date: record.arrivalDate,
          min: record.minPrice,
          max: record.maxPrice,
          modal: record.modalPrice,
        })),
      });
    } catch (error) {
      console.error('[AI Guru] mandi tool failed:', error.message);
      return json({ found: false, note: 'Mandi price service is not reachable right now.' });
    }
  },
});

/*
|--------------------------------------------------------------------------
| SERVICES: LABOUR, MACHINERY, DOCTORS
|--------------------------------------------------------------------------
*/

const locationArgs = {
  district: z.string().nullable().describe("District. Null for the farmer's own district."),
  state: z.string().nullable().describe('State. Null for the farmer’s own state.'),
};

const findLabourersTool = tool({
  name: 'find_labourers',
  description:
    'Search farm labourers available for hire on KhetiMaster near the farmer (type of work, skills, wage, availability).',
  parameters: z.object({
    workType: z
      .string()
      .nullable()
      .describe('Kind of work or skill, e.g. "harvesting", "spraying", "tractor driver".'),
    ...locationArgs,
  }),
  async execute(args, runContext) {
    const context = ctx(runContext);
    const base = { isActive: true, user: { $ne: context.userId } };

    if (args.workType) {
      const pattern = containsText(args.workType);
      base.$or = [{ labourType: pattern }, { skills: pattern }];
    }

    const { results, searchedIn } = await findNearby(context, args, '', (filter) =>
      Labourer.find({ ...base, ...filter })
        .select(
          'fullName labourType skills experience experienceUnit expectedWage wageType availability village district state rating totalReviews'
        )
        .sort({ availability: 1, rating: -1 })
        .limit(MAX_RESULTS)
        .lean()
    );

    suggestResults(context, results, {
      detail: 'labourer_details',
      list: 'labour',
      listLabel: 'Hire labour',
      idParam: 'labourerId',
      name: (item) => item.fullName,
    });

    return json({
      searchedIn,
      labourers: results.map((item) => ({
        labourerId: String(item._id),
        name: item.fullName,
        type: item.labourType,
        skills: item.skills,
        experience: `${item.experience ?? 0} ${item.experienceUnit || 'years'}`,
        wage: item.expectedWage ? `₹${item.expectedWage} ${item.wageType || 'daily'}` : null,
        availability: item.availability,
        location: [item.village, item.district, item.state].filter(Boolean).join(', '),
        rating: item.totalReviews ? item.rating : null,
      })),
    });
  },
});

const findMachineryTool = tool({
  name: 'find_machinery',
  description:
    'Search tractors and farm machinery available for rent on KhetiMaster near the farmer, with hourly / daily / per-acre rates.',
  parameters: z.object({
    query: z
      .string()
      .nullable()
      .describe('Machine or job, e.g. "tractor", "rotavator", "harvester", "sprayer".'),
    ...locationArgs,
  }),
  async execute(args, runContext) {
    const context = ctx(runContext);
    const base = { isActive: true, owner: { $ne: context.userId } };

    if (args.query) {
      const pattern = containsText(args.query);
      base.$or = [
        { name: pattern },
        { category: pattern },
        { brand: pattern },
        { supportedImplements: pattern },
      ];
    }

    const { results, searchedIn } = await findNearby(context, args, '', (filter) =>
      Machinery.find({ ...base, ...filter })
        .select(
          'name category brand model modelYear enginePower pricing availability village district state rating totalReviews'
        )
        .sort({ rating: -1, createdAt: -1 })
        .limit(MAX_RESULTS)
        .lean()
    );

    suggestResults(context, results, {
      detail: 'machinery_details',
      list: 'machinery',
      listLabel: 'Rent machinery',
      idParam: 'machineryId',
      name: (item) => item.name,
    });

    return json({
      searchedIn,
      machinery: results.map((item) => ({
        machineryId: String(item._id),
        name: item.name,
        category: item.category,
        brand: [item.brand, item.model, item.modelYear].filter(Boolean).join(' '),
        power: item.enginePower?.value
          ? `${item.enginePower.value} ${item.enginePower.unit}`
          : null,
        rates: {
          hourly: item.pricing?.hourly || null,
          daily: item.pricing?.daily || null,
          other: (item.pricing?.custom || []).map(
            (rate) => `₹${rate.amount} per ${rate.unit} (${rate.name})`
          ),
        },
        availability: item.availability,
        location: [item.village, item.district, item.state].filter(Boolean).join(', '),
        rating: item.totalReviews ? item.rating : null,
      })),
    });
  },
});

const findDoctorsTool = tool({
  name: 'find_doctors',
  description:
    'Search agricultural doctors (crop experts) and veterinarians (animal doctors) the farmer can book on KhetiMaster.',
  parameters: z.object({
    doctorType: z
      .enum(['veterinarian', 'agriculturalDoctor'])
      .nullable()
      .describe(
        'veterinarian for animals / livestock, agriculturalDoctor for crops. Null for both.'
      ),
    specialization: z.string().nullable().describe('e.g. "dairy cattle", "horticulture".'),
    ...locationArgs,
  }),
  async execute(args, runContext) {
    const context = ctx(runContext);
    const base = { isActive: true, user: { $ne: context.userId } };

    if (args.doctorType) base.doctorType = args.doctorType;
    if (args.specialization) base.specialization = containsText(args.specialization);

    const { results, searchedIn } = await findNearby(context, args, '', (filter) =>
      Doctor.find({ ...base, ...filter })
        .select(
          'fullName doctorType specialization qualification languages consultationFee consultationFeeType availability district state rating totalReviews'
        )
        .sort({ rating: -1 })
        .limit(MAX_RESULTS)
        .lean()
    );

    suggestResults(context, results, {
      detail: 'doctor_details',
      list: 'doctors',
      listLabel: 'Consult a doctor',
      idParam: 'doctorId',
      name: (item) => item.fullName,
    });

    return json({
      searchedIn,
      doctors: results.map((item) => ({
        doctorId: String(item._id),
        name: item.fullName,
        type: item.doctorType === 'veterinarian' ? 'Veterinarian' : 'Agricultural doctor',
        specialization: item.specialization,
        qualification: item.qualification,
        languages: item.languages,
        fee: item.consultationFee
          ? `₹${item.consultationFee} ${item.consultationFeeType || ''}`.trim()
          : 'free',
        availability: item.availability,
        location: [item.district, item.state].filter(Boolean).join(', '),
        rating: item.totalReviews ? item.rating : null,
      })),
    });
  },
});

/*
|--------------------------------------------------------------------------
| SHOPPING: NURSERY & MARKETPLACE
|--------------------------------------------------------------------------
*/

const findNurseryPlantsTool = tool({
  name: 'find_nursery_plants',
  description:
    'Search plants, saplings and seedlings for sale in the KhetiMaster nursery (price, stock, seller location).',
  parameters: z.object({
    query: z.string().nullable().describe('Plant name or category, e.g. "mango", "drumstick".'),
  }),
  async execute({ query }, runContext) {
    const context = ctx(runContext);
    const filter = {
      isActive: true,
      quantity: { $gt: 0 },
      'seller.userId': { $ne: context.userId },
    };

    if (query) {
      const pattern = containsText(query);
      filter.$or = [{ name: pattern }, { category: pattern }, { description: pattern }];
    }

    const plants = await Plant.find(filter)
      .select('name category price quantity seller.name location rating totalReviews')
      .sort({ totalSold: -1, rating: -1 })
      .limit(MAX_RESULTS)
      .lean();

    suggestResults(context, plants, {
      detail: 'nursery_plant',
      list: 'nursery',
      listLabel: 'Open nursery',
      idParam: 'plantId',
      name: (item) => item.name,
    });

    return json({
      plants: plants.map((plant) => ({
        plantId: String(plant._id),
        name: plant.name,
        category: plant.category,
        price: `₹${plant.price}`,
        inStock: plant.quantity,
        seller: plant.seller?.name,
        location: [plant.location?.district, plant.location?.state].filter(Boolean).join(', '),
        rating: plant.totalReviews ? plant.rating : null,
      })),
    });
  },
});

const findMarketListingsTool = tool({
  name: 'find_market_listings',
  description:
    'Search the KhetiMaster marketplace: produce (grains, vegetables, fruits...), used equipment, and farm inputs (seeds, fertilizer, pesticides) for sale by other farmers and sellers.',
  parameters: z.object({
    kind: z.enum(LISTING_KINDS).nullable().describe('PRODUCE, EQUIPMENT or INPUTS. Null for all.'),
    query: z
      .string()
      .nullable()
      .describe('What to look for, e.g. "soybean seed", "used rotavator".'),
    ...locationArgs,
  }),
  async execute(args, runContext) {
    const context = ctx(runContext);
    const base = {
      status: 'ACTIVE',
      seller: { $ne: context.userId },
      $and: [{ $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }] }],
    };

    if (args.kind) base.kind = args.kind;

    if (args.query) {
      const pattern = containsText(args.query);
      base.$and.push({
        $or: [{ title: pattern }, { category: pattern }, { variety: pattern }, { brand: pattern }],
      });
    }

    const { results, searchedIn } = await findNearby(context, args, 'location.', (filter) =>
      MarketListing.find({ ...base, ...filter })
        .select(
          'kind category title variety grade isOrganic brand model condition unit quantity pricePerUnit isNegotiable deliveryAvailable location'
        )
        .sort({ createdAt: -1 })
        .limit(MAX_RESULTS)
        .lean()
    );

    suggestResults(context, results, {
      detail: 'market_listing',
      list: 'market',
      listLabel: 'Open marketplace',
      idParam: 'listingId',
      name: (item) => item.title,
    });

    return json({
      searchedIn,
      listings: results.map((item) => ({
        listingId: String(item._id),
        title: item.title,
        kind: item.kind,
        category: item.category,
        details: [
          item.variety,
          item.grade,
          item.isOrganic ? 'organic' : null,
          item.brand,
          item.model,
          item.condition,
        ]
          .filter(Boolean)
          .join(', '),
        price: `₹${item.pricePerUnit} per ${item.unit}${item.isNegotiable ? ' (negotiable)' : ''}`,
        available: `${item.quantity} ${item.unit}`,
        delivery: Boolean(item.deliveryAvailable),
        location: [item.location?.district, item.location?.state].filter(Boolean).join(', '),
      })),
    });
  },
});

/*
|--------------------------------------------------------------------------
| THE FARMER'S OWN ACTIVITY
|--------------------------------------------------------------------------
*/

const getMyActivityTool = tool({
  name: 'get_my_bookings_and_orders',
  description:
    "The farmer's recent labour bookings, machinery bookings, doctor consultations, nursery orders and marketplace deals with their status.",
  parameters: z.object({}),
  async execute(_args, runContext) {
    const { userId } = ctx(runContext);
    const recent = { createdAt: -1 };

    const [labour, machinery, consultations, orders, deals] = await Promise.all([
      LabourBooking.find({ farmer: userId })
        .populate('labourer', 'fullName labourType')
        .select('labourer bookingDate numberOfDays workType status totalAmount')
        .sort(recent)
        .limit(5)
        .lean(),
      MachineryBooking.find({ farmer: userId })
        .populate('machinery', 'name category')
        .select('machinery bookingDate workType status totalAmount')
        .sort(recent)
        .limit(5)
        .lean(),
      DoctorConsultation.find({ farmer: userId })
        .populate('doctor', 'fullName doctorType')
        .select('doctor consultationDate startTime consultationType status diagnosis')
        .sort(recent)
        .limit(5)
        .lean(),
      NurseryOrder.find({ user: userId })
        .select('items.name items.quantity items.status total orderStatus createdAt')
        .sort(recent)
        .limit(5)
        .lean(),
      MarketDeal.find({ $or: [{ buyer: userId }, { seller: userId }] })
        .select('buyer listingSnapshot.title quantity pricePerUnit totalAmount status')
        .sort(recent)
        .limit(5)
        .lean(),
    ]);

    const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

    return json({
      labourBookings: labour.map((item) => ({
        labourer: item.labourer?.fullName,
        work: item.workType,
        date: day(item.bookingDate),
        days: item.numberOfDays,
        status: item.status,
        amount: item.totalAmount,
      })),
      machineryBookings: machinery.map((item) => ({
        machine: item.machinery?.name,
        work: item.workType,
        date: day(item.bookingDate),
        status: item.status,
        amount: item.totalAmount,
      })),
      doctorConsultations: consultations.map((item) => ({
        doctor: item.doctor?.fullName,
        type: item.consultationType,
        date: day(item.consultationDate),
        time: item.startTime,
        status: item.status,
        diagnosis: item.diagnosis || null,
      })),
      nurseryOrders: orders.map((order) => ({
        date: day(order.createdAt),
        status: order.orderStatus,
        total: order.total,
        items: (order.items || []).map(
          (item) => `${item.quantity} x ${item.name} (${item.status || 'pending'})`
        ),
      })),
      marketDeals: deals.map((deal) => ({
        role: String(deal.buyer) === String(userId) ? 'buying' : 'selling',
        listing: deal.listingSnapshot?.title,
        quantity: deal.quantity,
        pricePerUnit: deal.pricePerUnit,
        total: deal.totalAmount,
        status: deal.status,
      })),
    });
  },
});

/*
|--------------------------------------------------------------------------
| NEWS
|--------------------------------------------------------------------------
*/

const getAgriNewsTool = tool({
  name: 'get_agri_news',
  description: 'Latest agriculture news and government updates (PIB, ICAR, FAO) shown in the app.',
  parameters: z.object({}),
  async execute() {
    const articles = await getLatestArticles({ limit: 6 });

    return json({
      articles: articles.map((article) => ({
        title: article.title,
        summary: String(article.description || '').slice(0, 220),
        source: article.source,
        date: article.publishedAt ? new Date(article.publishedAt).toISOString().slice(0, 10) : null,
      })),
    });
  },
});

/*
|--------------------------------------------------------------------------
| OPEN AN APP SCREEN
|--------------------------------------------------------------------------
*/

const openAppScreenTool = tool({
  name: 'open_app_screen',
  description:
    'Show a button under your reply that opens a KhetiMaster screen (e.g. add_farm, disease_detection, market_sell, gov_schemes). Search tools already add buttons for their results. Call once per button, at most 3 per reply.',
  parameters: z.object({
    screen: z.enum(APP_SCREEN_KEYS),
    label: z.string().describe('Short button text in the reply language, e.g. "Book Ramesh".'),
    id: z
      .string()
      .nullable()
      .describe(
        'Record id for detail screens (fieldId, labourerId, machineryId, doctorId, plantId, listingId) or the crop name for mandi_crop. Null otherwise.'
      ),
  }),
  async execute({ screen, label, id }, runContext) {
    const context = ctx(runContext);
    const { param } = APP_SCREENS[screen];

    if (param && !id) {
      return json({ ok: false, note: `${screen} needs ${param}.` });
    }

    const added = suggestScreen(context, screen, label, param ? { [param]: id } : {});

    return json(added ? { ok: true } : { ok: false, note: 'Already showing 3 buttons.' });
  },
});

export const aiGuruTools = [
  getMyFarmsTool,
  getFarmAdvisoryTool,
  getWeatherTool,
  getMandiPricesTool,
  findLabourersTool,
  findMachineryTool,
  findDoctorsTool,
  findNurseryPlantsTool,
  findMarketListingsTool,
  getMyActivityTool,
  getAgriNewsTool,
  openAppScreenTool,
];
