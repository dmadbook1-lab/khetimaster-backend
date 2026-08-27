import express from 'express';

import {
  sendOtp,
  verifyOtp,
  completeProfile,
  refreshAccessToken,
  getMe,
  logout,
} from '../controllers/authController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/send-otp', sendOtp);

router.post('/verify-otp', verifyOtp);

router.post('/complete-profile', completeProfile);

router.post('/refresh', refreshAccessToken);

router.get('/me', authMiddleware, getMe);

router.post('/logout', authMiddleware, logout);

export default router;
