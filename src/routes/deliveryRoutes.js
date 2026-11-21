import express from 'express';

import {
  getDeliveryMeta,
  getAllPartners,
  getPartnerById,
  createPartner,
  getMyPartnerProfile,
  updateMyPartnerProfile,
  setMyOnlineStatus,
  updateMyLocation,
  deactivateMyPartnerProfile,
  activateMyPartnerProfile,
} from '../controllers/deliveryPartnerController.js';

import {
  getDeliveryQuote,
  createDeliveryBooking,
  getMyDeliveryBookings,
  getPartnerRequests,
  getDeliveryBookingById,
  acceptDeliveryBooking,
  rejectDeliveryBooking,
  cancelDeliveryBooking,
  markArrived,
  markPickedUp,
  markDelivered,
  reviewDeliveryBooking,
} from '../controllers/deliveryBookingController.js';

import authMiddleware from '../middleware/authMiddleware.js';

/*
 * Delivery partners (drivers) and delivery bookings.
 * Mounted at /api/delivery.
 */
const router = express.Router();

router.use(authMiddleware);

/* PARTNERS */
router.get('/partners/meta', getDeliveryMeta);
router.get('/partners', getAllPartners);
router.post('/partners', createPartner);
router.get('/partners/me', getMyPartnerProfile);
router.put('/partners/me', updateMyPartnerProfile);
router.delete('/partners/me', deactivateMyPartnerProfile);
router.patch('/partners/me/activate', activateMyPartnerProfile);
router.patch('/partners/me/online', setMyOnlineStatus);
router.patch('/partners/me/location', updateMyLocation);
router.get('/partners/:id', getPartnerById);

/* BOOKINGS */
router.post('/bookings/quote', getDeliveryQuote);
router.post('/bookings', createDeliveryBooking);
router.get('/bookings/my-bookings', getMyDeliveryBookings);
router.get('/bookings/requests', getPartnerRequests);
router.get('/bookings/:id', getDeliveryBookingById);
router.patch('/bookings/:id/accept', acceptDeliveryBooking);
router.patch('/bookings/:id/reject', rejectDeliveryBooking);
router.patch('/bookings/:id/cancel', cancelDeliveryBooking);
router.patch('/bookings/:id/arrived', markArrived);
router.patch('/bookings/:id/picked-up', markPickedUp);
router.patch('/bookings/:id/deliver', markDelivered);
router.post('/bookings/:id/review', reviewDeliveryBooking);

export default router;
