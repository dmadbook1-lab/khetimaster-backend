import express from 'express';

import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getSellerOrders,
  updateSellerOrderStatus,
  reviewOrderItem,
} from '../controllers/nurseryOrderController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| BUYER
|--------------------------------------------------------------------------
*/

// Place order (checks out the whole cart)
router.post('/', createOrder);

// Get user's orders
router.get('/', getMyOrders);

/*
|--------------------------------------------------------------------------
| SELLER
|--------------------------------------------------------------------------
|
| IMPORTANT: /seller must come before /:id.
|
*/

// Orders containing the seller's plants
router.get('/seller', getSellerOrders);

// Confirm / dispatch / deliver / cancel the seller's items
router.patch('/:id/seller-status', updateSellerOrderStatus);

/*
|--------------------------------------------------------------------------
| BUYER - SINGLE ORDER
|--------------------------------------------------------------------------
*/

// Get one order
router.get('/:id', getOrderById);

// Cancel order
router.put('/:id/cancel', cancelOrder);

// Review a delivered plant
router.post('/:id/items/:itemId/review', reviewOrderItem);

export default router;
