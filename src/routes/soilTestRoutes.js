import express from 'express';

import {
  createSoilTest,
  getMySoilTests,
  getSoilTest,
  refreshSoilTest,
} from '../controllers/soilTestController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, createSoilTest);
router.get('/my', authMiddleware, getMySoilTests);
router.get('/:id', authMiddleware, getSoilTest);
router.post('/:id/refresh', authMiddleware, refreshSoilTest);

export default router;
