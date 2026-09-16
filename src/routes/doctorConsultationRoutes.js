import express from 'express';

import {
  createDoctorConsultation,
  getMyConsultations,
  getDoctorRequests,
  getConsultationById,
  acceptConsultation,
  rejectConsultation,
  cancelConsultation,
  completeConsultation,
} from '../controllers/doctorConsultationController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Farmer
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  authMiddleware,
  createDoctorConsultation
);

router.get(
  '/my',
  authMiddleware,
  getMyConsultations
);

/*
|--------------------------------------------------------------------------
| Doctor
|--------------------------------------------------------------------------
*/

router.get(
  '/requests',
  authMiddleware,
  getDoctorRequests
);

/*
|--------------------------------------------------------------------------
| Shared
|--------------------------------------------------------------------------
*/

router.get(
  '/:id',
  authMiddleware,
  getConsultationById
);

router.patch(
  '/:id/accept',
  authMiddleware,
  acceptConsultation
);

router.patch(
  '/:id/reject',
  authMiddleware,
  rejectConsultation
);

router.patch(
  '/:id/cancel',
  authMiddleware,
  cancelConsultation
);

router.patch(
  '/:id/complete',
  authMiddleware,
  completeConsultation
);

export default router;