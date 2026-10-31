import express from 'express';

import authMiddleware from '../middleware/authMiddleware.js';

import {
  getFieldAdvisory,
  regenerateFieldAdvisory,
  getFieldAdvisoryHistory,
  getNpkBreakdown,
  getFieldConditionsController,
  updateActivityProgress,
} from '../controllers/advisory.controller.js';

const router =
  express.Router();

router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| ACTIVITY PROGRESS
|--------------------------------------------------------------------------
|
| PATCH /api/advisory/activity/:advisoryId/:activityType
|
*/

router.patch(
  '/activity/:advisoryId/:activityType',
  updateActivityProgress,
);

/*
|--------------------------------------------------------------------------
| FARM ADVISORY
|--------------------------------------------------------------------------
|
| GET  /api/advisory/:fieldId
| POST /api/advisory/:fieldId/generate
| GET  /api/advisory/:fieldId/history
| GET  /api/advisory/:fieldId/npk-breakdown
| GET  /api/advisory/:fieldId/conditions
|
*/

router.get(
  '/:fieldId',
  getFieldAdvisory,
);

router.post(
  '/:fieldId/generate',
  regenerateFieldAdvisory,
);

router.get(
  '/:fieldId/history',
  getFieldAdvisoryHistory,
);

router.get(
  '/:fieldId/npk-breakdown',
  getNpkBreakdown,
);

router.get(
  '/:fieldId/conditions',
  getFieldConditionsController,
);

export default router;
