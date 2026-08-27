import express from 'express';

import {
  createLabourBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  acceptBooking,
  rejectBooking,
  completeBooking,
  getLabourerRequests,
} from '../controllers/labourBookingController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, createLabourBooking);
router.get('/my-bookings', authMiddleware, getMyBookings);
router.get('/requests', authMiddleware, getLabourerRequests);
router.get('/:id', authMiddleware, getBookingById);
router.patch('/:id/cancel', authMiddleware, cancelBooking);
router.patch('/:id/accept', authMiddleware, acceptBooking);
router.patch('/:id/reject', authMiddleware, rejectBooking);
router.patch('/:id/complete', authMiddleware, completeBooking);

export default router;
