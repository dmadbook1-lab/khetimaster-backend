import express from 'express';

import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from '../controllers/nurseryCartController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getCart);

router.post('/', addToCart);

router.put('/:itemId', updateCartItem);

router.delete('/:itemId', removeFromCart);

router.delete('/', clearCart);

export default router;