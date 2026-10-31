import cron from 'node-cron';

import FarmField from '../models/farmField.model.js';

import {
  generateAdvisoryForField,
  getLatestAdvisory,
} from '../advisory/services/advisory.service.js';
import {getForecastWeather} from '../advisory/client/weather.client.js';
import {fieldCentroid} from '../advisory/core/geometry/farmGeometry.js';
import {
  assembleWeatherSummary,
  buildWeatherSnapshot,
  shouldGenerateAdvisory,
} from '../advisory/utils/weather/weatherSnapshot.utils.js';

/*
|--------------------------------------------------------------------------
| DAILY ADVISORY REFRESH
|--------------------------------------------------------------------------
|
| Once a day, regenerate a farm's advisory when it has none, when the
| last one is ADVISORY_MAX_AGE_DAYS old, or when the weather outlook
| changed enough to matter (heavy rain, temperature swing, wind alert).
|
| Farms are processed one at a time to stay gentle on the satellite
| and weather APIs.
|
*/

const MAX_AGE_DAYS =
  Number(process.env.ADVISORY_MAX_AGE_DAYS) || 3;

async function refreshFarm(farm) {
  const lastAdvisory = await getLatestAdvisory(farm._id);

  let currentSnapshot = null;

  try {
    const forecast = await getForecastWeather(fieldCentroid(farm.field));

    currentSnapshot = buildWeatherSnapshot(
      assembleWeatherSummary(null, forecast),
    );
  } catch (error) {
    console.warn(
      `[AdvisoryJob] ${farm._id} forecast failed:`,
      error?.message || error,
    );
  }

  const decision = shouldGenerateAdvisory({
    gddDelta: 0,
    threshold: Number.POSITIVE_INFINITY,
    lastAdvisory,
    currentSnapshot,
    maxDaysBetweenAdvisories: MAX_AGE_DAYS,
  });

  if (!decision.generate) {
    return false;
  }

  console.log(`[AdvisoryJob] ${farm._id}: ${decision.reason}`);

  await generateAdvisoryForField(farm._id, {
    language: lastAdvisory?.language || 'en',
  });

  return true;
}

export async function refreshAllAdvisories() {
  const farms = await FarmField.find({})
    .select('_id field')
    .lean();

  let generated = 0;

  for (const farm of farms) {
    try {
      if (await refreshFarm(farm)) {
        generated += 1;
      }
    } catch (error) {
      console.error(
        `[AdvisoryJob] ${farm._id} failed:`,
        error?.message || error,
      );
    }
  }

  return {farms: farms.length, generated};
}

export function startAdvisoryRefreshJob() {
  const cronExpression =
    process.env.ADVISORY_REFRESH_CRON || '30 5 * * *';

  console.log(
    `Advisory refresh job scheduled (${cronExpression}, Asia/Kolkata)`,
  );

  cron.schedule(
    cronExpression,
    async () => {
      try {
        const result = await refreshAllAdvisories();

        console.log('Advisory refresh completed:', result);
      } catch (error) {
        console.error('Advisory refresh failed:', error);
      }
    },
    {timezone: 'Asia/Kolkata'},
  );
}
