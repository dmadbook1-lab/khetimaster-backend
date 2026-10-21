import express from 'express';

import {
  getMarketMeta,
  createListing,
  getListings,
  getMyListings,
  getListingById,
  updateListing,
  updateListingStatus,
  deleteListing,
  saveListing,
  unsaveListing,
  getSavedListings,
  getSellerProfile,
} from '../controllers/marketListingController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

/*
 * GET /api/market/meta
 *
 * Categories, units, conditions, grades
 */
router.get('/meta', getMarketMeta);

/*
|--------------------------------------------------------------------------
| LISTINGS
|--------------------------------------------------------------------------
|
| IMPORTANT:
| /listings/mine must come BEFORE /listings/:id.
|
*/

router.get('/listings', getListings);

router.get('/listings/mine', getMyListings);

router.post('/listings', createListing);

router.get('/listings/:id', getListingById);

router.put('/listings/:id', updateListing);

router.patch('/listings/:id/status', updateListingStatus);

router.delete('/listings/:id', deleteListing);

/*
|--------------------------------------------------------------------------
| SAVED LISTINGS
|--------------------------------------------------------------------------
*/

router.get('/saved', getSavedListings);

router.post('/listings/:id/save', saveListing);

router.delete('/listings/:id/save', unsaveListing);

/*
|--------------------------------------------------------------------------
| SELLERS
|--------------------------------------------------------------------------
*/

router.get('/sellers/:userId', getSellerProfile);

export default router;
