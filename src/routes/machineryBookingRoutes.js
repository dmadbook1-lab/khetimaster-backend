import express from 'express';

import {
  createMachineryBooking,
  getMyMachineryBookings,
  getMachineryRequests,
  getMachineryBookingById,
  cancelMachineryBooking,
  acceptMachineryBooking,
  rejectMachineryBooking,
  completeMachineryBooking,
} from '../controllers/machineryBookingController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| FARMER
|--------------------------------------------------------------------------
*/

/*
 * POST /api/machinery-bookings
 */
router.post(
  '/',
  authMiddleware,
  createMachineryBooking,
);

/*
 * GET /api/machinery-bookings/my-bookings
 */
router.get(
  '/my-bookings',
  authMiddleware,
  getMyMachineryBookings,
);

/*
|--------------------------------------------------------------------------
| MACHINERY OWNER
|--------------------------------------------------------------------------
*/

/*
 * GET /api/machinery-bookings/requests
 */
router.get(
  '/requests',
  authMiddleware,
  getMachineryRequests,
);

/*
|--------------------------------------------------------------------------
| SINGLE BOOKING
|--------------------------------------------------------------------------
*/

/*
 * GET /api/machinery-bookings/:id
 */
router.get(
  '/:id',
  authMiddleware,
  getMachineryBookingById,
);

/*
|--------------------------------------------------------------------------
| ACTIONS
|--------------------------------------------------------------------------
*/

/*
 * PATCH /api/machinery-bookings/:id/cancel
 */
router.patch(
  '/:id/cancel',
  authMiddleware,
  cancelMachineryBooking,
);

/*
 * PATCH /api/machinery-bookings/:id/accept
 */
router.patch(
  '/:id/accept',
  authMiddleware,
  acceptMachineryBooking,
);

/*
 * PATCH /api/machinery-bookings/:id/reject
 */
router.patch(
  '/:id/reject',
  authMiddleware,
  rejectMachineryBooking,
);

/*
 * PATCH /api/machinery-bookings/:id/complete
 */
router.patch(
  '/:id/complete',
  authMiddleware,
  completeMachineryBooking,
);

export default router;