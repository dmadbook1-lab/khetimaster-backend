import FarmField from '../../models/farmField.model.js';
import FarmAdvisory from '../models/farmAdvisory.model.js';
import {runCropAdvisoryPipeline} from '../pipeline/cropPipeline.js';
import {runBarrenAdvisoryPipeline} from '../pipeline/barrenPipeline.js';
import {enrichAdvisoryForClient} from '../utils/enrichAdvisoryForClient.js';

/*
|--------------------------------------------------------------------------
| ADVISORY SERVICE
|--------------------------------------------------------------------------
|
| Runs the smart-advisory pipeline (weather → satellite → GDD/BBCH →
| NPK → crop health → fertigation → spray → activities) for a farm
| and stores the result as a FarmAdvisory.
|
| A pipeline run calls several external APIs and can take 20–60 s,
| so callers normally start it in the background and poll for the
| latest advisory.
|
*/

/** A newer advisory is generated in the background once the latest one is this old. */
export const ADVISORY_STALE_HOURS =
  Number(process.env.ADVISORY_STALE_HOURS) || 24;

/** fieldId → Promise of the running generation, so a farm never runs twice at once. */
const inFlight = new Map();

export const isGenerating = fieldId => inFlight.has(String(fieldId));

export const isAdvisoryStale = advisory => {
  if (!advisory?.createdAt) {
    return true;
  }

  const ageMs = Date.now() - new Date(advisory.createdAt).getTime();

  return ageMs >= ADVISORY_STALE_HOURS * 60 * 60 * 1000;
};

async function runPipelineForField(fieldId, language) {
  const farmField = await FarmField.findById(fieldId).lean();

  if (!farmField) {
    throw new Error(`Farm field not found: ${fieldId}`);
  }

  const options = {
    farmField,
    language,
    platform: 'app',
    notify: false,
  };

  const {advisory} = farmField.isBarrenLand
    ? await runBarrenAdvisoryPipeline(options)
    : await runCropAdvisoryPipeline(options);

  return advisory;
}

/**
 * Generate a new advisory for a farm. Concurrent calls for the same farm
 * share one pipeline run.
 */
export function generateAdvisoryForField(fieldId, {language = 'en'} = {}) {
  const key = String(fieldId);

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const startedAt = Date.now();

  const run = runPipelineForField(key, language)
    .then(advisory => {
      console.log(
        `[Advisory] ${key} generated in ${Date.now() - startedAt}ms`,
      );

      return advisory;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, run);

  return run;
}

/** Fire-and-forget generation; errors are logged, never thrown. */
export function generateAdvisoryInBackground(fieldId, options = {}) {
  generateAdvisoryForField(fieldId, options).catch(error => {
    console.error(
      `[Advisory] ${fieldId} generation failed:`,
      error?.message || error,
    );
  });
}

export async function getLatestAdvisory(fieldId) {
  return FarmAdvisory.findOne({farmFieldId: fieldId})
    .sort({createdAt: -1})
    .lean();
}

export function toClientAdvisory(advisory, {language = 'en', farmField} = {}) {
  if (!advisory) {
    return null;
  }

  return enrichAdvisoryForClient(advisory, {language, farmField});
}

/**
 * Field changes that alter the agronomy (crop, sowing date, boundary,
 * irrigation, farming type, barren flag) invalidate the stored advisory.
 */
export const ADVISORY_INPUT_FIELDS = [
  'latlng',
  'cropName',
  'variety',
  'sowingDate',
  'typeOfIrrigation',
  'typeOfFarming',
  'isBarrenLand',
  'acre',
];

export const touchesAdvisoryInputs = body =>
  ADVISORY_INPUT_FIELDS.some(key => body?.[key] !== undefined);

export async function deleteAdvisoriesForField(fieldId) {
  await FarmAdvisory.deleteMany({farmFieldId: fieldId});
}
