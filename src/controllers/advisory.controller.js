import mongoose from 'mongoose';

import FarmField from '../models/farmField.model.js';
import FarmAdvisory from '../advisory/models/farmAdvisory.model.js';
import {
  generateAdvisoryInBackground,
  getLatestAdvisory,
  isAdvisoryStale,
  isGenerating,
  toClientAdvisory,
} from '../advisory/services/advisory.service.js';
import {getFieldConditions} from '../advisory/client/weather.client.js';
import {fieldCentroid} from '../advisory/core/geometry/farmGeometry.js';

/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const VALID_PROGRESS = ['started', 'in_progress', 'completed'];

const ACTIVITY_TYPES = [
  'SPRAY',
  'FERTIGATION',
  'IRRIGATION',
  'WEATHER',
  'CROP_RISK',
  'MONITORING',
  'CARBON_TRACKING',
];

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const resolveLanguage = req =>
  String(req.query.lang || req.headers['accept-language'] || 'en')
    .slice(0, 3)
    .split(/[-_,;]/)[0]
    .toLowerCase() || 'en';

/**
 * Load a farm field and make sure it belongs to the signed-in user.
 * Sends the error response itself and returns null on failure.
 */
const loadOwnedField = async (req, res, fieldId) => {
  if (!mongoose.Types.ObjectId.isValid(fieldId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid farm field ID',
    });

    return null;
  }

  const farmField = await FarmField.findById(fieldId).lean();

  if (!farmField) {
    res.status(404).json({
      success: false,
      message: 'Farm field not found',
    });

    return null;
  }

  if (String(farmField.user) !== String(req.user?.userId)) {
    res.status(403).json({
      success: false,
      message: 'You can only view advisories for your own farms',
    });

    return null;
  }

  return farmField;
};

const serverError = (res, label, error) => {
  console.error(`${label}:`, error);

  return res.status(500).json({
    success: false,
    message: 'Server error',
    error: error.message,
  });
};

/*
|--------------------------------------------------------------------------
| GET LATEST ADVISORY
|--------------------------------------------------------------------------
|
| GET /api/advisory/:fieldId
|
| Returns the latest advisory. When there is none yet, or it is older
| than ADVISORY_STALE_HOURS, a new one is generated in the background
| and `generating: true` tells the app to poll again.
|
*/

export const getFieldAdvisory = async (req, res) => {
  try {
    const {fieldId} = req.params;

    const farmField = await loadOwnedField(req, res, fieldId);

    if (!farmField) {
      return;
    }

    const language = resolveLanguage(req);
    const latest = await getLatestAdvisory(fieldId);

    if (!latest || isAdvisoryStale(latest)) {
      generateAdvisoryInBackground(fieldId, {language});
    }

    return res.status(200).json({
      success: true,
      generating: isGenerating(fieldId),
      stale: latest ? isAdvisoryStale(latest) : true,
      advisory: toClientAdvisory(latest, {language, farmField}),
    });
  } catch (error) {
    return serverError(res, 'Error fetching advisory', error);
  }
};

/*
|--------------------------------------------------------------------------
| REGENERATE ADVISORY
|--------------------------------------------------------------------------
|
| POST /api/advisory/:fieldId/generate
|
*/

export const regenerateFieldAdvisory = async (req, res) => {
  try {
    const {fieldId} = req.params;

    const farmField = await loadOwnedField(req, res, fieldId);

    if (!farmField) {
      return;
    }

    generateAdvisoryInBackground(fieldId, {
      language: resolveLanguage(req),
    });

    return res.status(202).json({
      success: true,
      generating: true,
      message: 'Advisory generation started',
    });
  } catch (error) {
    return serverError(res, 'Error starting advisory generation', error);
  }
};

/*
|--------------------------------------------------------------------------
| ADVISORY HISTORY
|--------------------------------------------------------------------------
|
| GET /api/advisory/:fieldId/history?limit=10
|
*/

export const getFieldAdvisoryHistory = async (req, res) => {
  try {
    const {fieldId} = req.params;

    const farmField = await loadOwnedField(req, res, fieldId);

    if (!farmField) {
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const language = resolveLanguage(req);

    const advisories = await FarmAdvisory.find({farmFieldId: fieldId})
      .sort({createdAt: -1})
      .limit(limit)
      .select(
        'createdAt cropHealth plantGrowthActivity.bbchStage plantGrowthActivity.stageName yield activitiesToDo.type activitiesToDo.title activitiesToDo.progress',
      )
      .lean();

    return res.status(200).json({
      success: true,
      count: advisories.length,
      advisories: advisories.map(advisory =>
        toClientAdvisory(advisory, {language, farmField}),
      ),
    });
  } catch (error) {
    return serverError(res, 'Error fetching advisory history', error);
  }
};

/*
|--------------------------------------------------------------------------
| NPK BREAKDOWN
|--------------------------------------------------------------------------
|
| GET /api/advisory/:fieldId/npk-breakdown
|
*/

export const getNpkBreakdown = async (req, res) => {
  try {
    const {fieldId} = req.params;

    const farmField = await loadOwnedField(req, res, fieldId);

    if (!farmField) {
      return;
    }

    const advisory = await getLatestAdvisory(fieldId);

    if (!advisory) {
      return res.status(404).json({
        success: false,
        message: 'No advisory found for this farm field',
      });
    }

    const required = advisory.npkManagement?.required ?? {};
    const available = advisory.npkManagement?.available ?? {};

    const nutrient = key => {
      const req = Number(required[key]) || 0;
      const avail = Number(available[key]) || 0;

      return {
        unit: 'kg/ha',
        required: req,
        available: avail,
        deficit: Math.max(0, Number((req - avail).toFixed(1))),
      };
    };

    const nitrogen = nutrient('nitrogenKgPerHa');
    const phosphorous = nutrient('phosphorousKgPerHa');
    const potassium = nutrient('potassiumKgPerHa');

    const sum = field =>
      Number(
        (nitrogen[field] + phosphorous[field] + potassium[field]).toFixed(1),
      );

    const enriched = toClientAdvisory(advisory, {
      language: resolveLanguage(req),
      farmField,
    });

    return res.status(200).json({
      success: true,
      data: {
        advisoryId: advisory._id,
        generatedAt: advisory.createdAt,
        stage: enriched.plantGrowthActivity ?? null,
        cropStage: enriched.cropStage ?? null,
        npkDisplay: enriched.npkManagement?.display ?? null,
        npkBreakdown: {nitrogen, phosphorous, potassium},
        totals: {
          unit: 'kg/ha',
          required: sum('required'),
          available: sum('available'),
          deficit: sum('deficit'),
        },
      },
    });
  } catch (error) {
    return serverError(res, 'Error fetching NPK breakdown', error);
  }
};

/*
|--------------------------------------------------------------------------
| FIELD CONDITIONS (SOIL + WEATHER)
|--------------------------------------------------------------------------
|
| GET /api/advisory/:fieldId/conditions
|
| Live soil moisture / soil temperature and the 7-day forecast at the
| field centroid.
|
*/

export const getFieldConditionsController = async (req, res) => {
  try {
    const {fieldId} = req.params;

    const farmField = await loadOwnedField(req, res, fieldId);

    if (!farmField) {
      return;
    }

    const conditions = await getFieldConditions(
      fieldCentroid(farmField.field),
    );

    return res.status(200).json({
      success: true,
      data: conditions,
    });
  } catch (error) {
    return serverError(res, 'Error fetching field conditions', error);
  }
};

/*
|--------------------------------------------------------------------------
| ACTIVITY PROGRESS
|--------------------------------------------------------------------------
|
| PATCH /api/advisory/activity/:advisoryId/:activityType
|
| body: { progress: 'started' | 'in_progress' | 'completed' }
|
*/

export const updateActivityProgress = async (req, res) => {
  try {
    const {advisoryId} = req.params;
    const activityType = String(req.params.activityType || '').toUpperCase();
    const {progress} = req.body;

    if (!mongoose.Types.ObjectId.isValid(advisoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid advisory ID',
      });
    }

    if (!VALID_PROGRESS.includes(progress)) {
      return res.status(400).json({
        success: false,
        message: 'progress must be started, in_progress or completed',
      });
    }

    if (!ACTIVITY_TYPES.includes(activityType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid activity type',
      });
    }

    const advisory = await FarmAdvisory.findById(advisoryId);

    if (!advisory) {
      return res.status(404).json({
        success: false,
        message: 'Advisory not found',
      });
    }

    const farmField = await loadOwnedField(req, res, advisory.farmFieldId);

    if (!farmField) {
      return;
    }

    const activity = advisory.activitiesToDo.find(
      item => item.type === activityType,
    );

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found on this advisory',
      });
    }

    activity.progress = progress;
    activity.completedAt = progress === 'completed' ? new Date() : null;

    advisory.markModified('activitiesToDo');

    await advisory.save();

    return res.status(200).json({
      success: true,
      message: 'Activity progress updated',
      advisory: toClientAdvisory(advisory.toObject(), {
        language: resolveLanguage(req),
        farmField,
      }),
    });
  } catch (error) {
    return serverError(res, 'Error updating activity progress', error);
  }
};
