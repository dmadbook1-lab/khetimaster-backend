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
  updateConsultationNotes,
  reviewConsultation,
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

/*
 * Doctor adds / corrects diagnosis, prescription, notes
 */
router.patch(
  '/:id/notes',
  authMiddleware,
  updateConsultationNotes
);

/*
 * Farmer rates the doctor after completion
 */
router.post(
  '/:id/review',
  authMiddleware,
  reviewConsultation
);

export default router;