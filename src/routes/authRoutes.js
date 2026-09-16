import express from 'express';

import {
  sendOtp,
  verifyOtp,
  completeProfile,
  updateProfile,
  refreshAccessToken,
  getMe,
  logout,
} from '../controllers/authController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

router.post('/send-otp', sendOtp);

router.post('/verify-otp', verifyOtp);

router.post('/complete-profile', completeProfile);

/*
|--------------------------------------------------------------------------
| Profile
|--------------------------------------------------------------------------
*/

router.put(
  '/update-profile',
  authMiddleware,
  updateProfile,
);

/*
|--------------------------------------------------------------------------
| Session
|--------------------------------------------------------------------------
*/

router.post('/refresh', refreshAccessToken);

router.get(
  '/me',
  authMiddleware,
  getMe,
);

router.post(
  '/logout',
  authMiddleware,
  logout,
);

export default router;