import express from 'express';

import {
  createDeal,
  getMyDeals,
  getDealById,
  counterDeal,
  acceptDeal,
  rejectDeal,
  cancelDeal,
  completeDeal,
  reviewDeal,
} from '../controllers/marketDealController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

// Buyer makes an offer on a listing
router.post('/', createDeal);

// Deals I'm buying or selling in
router.get('/', getMyDeals);

router.get('/:id', getDealById);

// Negotiation (only the side whose turn it is)
router.patch('/:id/counter', counterDeal);

router.patch('/:id/accept', acceptDeal);

router.patch('/:id/reject', rejectDeal);

// Either side
router.patch('/:id/cancel', cancelDeal);

// Seller
router.patch('/:id/complete', completeDeal);

// Buyer
router.post('/:id/review', reviewDeal);

export default router;
