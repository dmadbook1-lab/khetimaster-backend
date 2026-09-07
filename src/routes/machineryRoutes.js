import express from 'express';

import {
  createMachinery,
  getAllMachinery,
  getMyMachinery,
  getMachineryById,
  updateMyMachinery,
  deactivateMachinery,
  activateMachinery,
} from '../controllers/machineryController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| FARMER / GENERAL
|--------------------------------------------------------------------------
*/

/*
 * GET /api/machinery
 *
 * Find available machinery
 */
router.get(
  '/',
  authMiddleware,
  getAllMachinery,
);

/*
|--------------------------------------------------------------------------
| OWNER
|--------------------------------------------------------------------------
*/

/*
 * GET /api/machinery/my-machinery
 */
router.get(
  '/my-machinery',
  authMiddleware,
  getMyMachinery,
);

/*
 * POST /api/machinery
 */
router.post(
  '/',
  authMiddleware,
  createMachinery,
);

/*
 * PUT /api/machinery/:id
 */
router.put(
  '/:id',
  authMiddleware,
  updateMyMachinery,
);

/*
 * DELETE /api/machinery/:id
 */
router.delete(
  '/:id',
  authMiddleware,
  deactivateMachinery,
);

/*
 * PATCH /api/machinery/:id/activate
 */
router.patch(
  '/:id/activate',
  authMiddleware,
  activateMachinery,
);

/*
|--------------------------------------------------------------------------
| GET SINGLE MACHINERY
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This must come AFTER /my-machinery.
|
|--------------------------------------------------------------------------
*/

router.get(
  '/:id',
  authMiddleware,
  getMachineryById,
);

export default router;
