import express from 'express';

import {
  createDoctor,
  getAllDoctors,
  getMyDoctorProfile,
  getDoctorById,
  updateMyDoctorProfile,
  deactivateMyDoctorProfile,
  activateMyDoctorProfile,
} from '../controllers/doctorController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Doctor Profile Routes
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  authMiddleware,
  createDoctor
);

router.get(
  '/',
  authMiddleware,
  getAllDoctors
);

router.get(
  '/me',
  authMiddleware,
  getMyDoctorProfile
);

router.get(
  '/:id',
  authMiddleware,
  getDoctorById
);

router.put(
  '/me',
  authMiddleware,
  updateMyDoctorProfile
);

router.patch(
  '/me/deactivate',
  authMiddleware,
  deactivateMyDoctorProfile
);

router.patch(
  '/me/activate',
  authMiddleware,
  activateMyDoctorProfile
);

export default router;