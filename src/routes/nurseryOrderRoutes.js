import express from 'express';

import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
} from '../controllers/nurseryOrderController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

// Place order
router.post('/', createOrder);

// Get user's orders
router.get('/', getMyOrders);

// Get one order
router.get('/:id', getOrderById);

// Cancel order
router.put('/:id/cancel', cancelOrder);

export default router;