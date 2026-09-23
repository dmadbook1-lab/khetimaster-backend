import express from 'express';

import {
  getMandiCrops,
  getMandiRates,
  getMandiStates,
  getMandiDistricts,
} from '../controllers/mandiController.js';

const router = express.Router();

router.get('/crops', getMandiCrops);

router.get('/states', getMandiStates);

router.get('/districts', getMandiDistricts);

router.get('/rates', getMandiRates);

export default router;