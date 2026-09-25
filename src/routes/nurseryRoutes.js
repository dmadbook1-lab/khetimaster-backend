import express from 'express';

import {
  getPlants,
  getPlantById,
  getCategories,
  createPlant,
  getMyListings,
  updatePlant,
  deletePlant,
} from '../controllers/nurseryController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

/*
|--------------------------------------------------------------------------
| PUBLIC ROUTES
|--------------------------------------------------------------------------
*/

// Get all available plants
router.get('/plants', getPlants);

// Get categories
router.get('/categories', getCategories);

// Get single plant
router.get('/plants/:id', getPlantById);

/*
|--------------------------------------------------------------------------
| AUTHENTICATED ROUTES
|--------------------------------------------------------------------------
*/

// Create listing
router.post(
  '/plants',
  authMiddleware,
  createPlant
);

// Get user's listings
router.get(
  '/my-listings',
  authMiddleware,
  getMyListings
);

// Update user's listing
router.put(
  '/plants/:id',
  authMiddleware,
  updatePlant
);

// Remove user's listing
router.delete(
  '/plants/:id',
  authMiddleware,
  deletePlant
);

export default router;