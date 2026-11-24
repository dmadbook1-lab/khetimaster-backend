import express from 'express';

import {
  listSchemes,
  getScheme,
  getSchemeStats,
  runTranslation,
} from '../controllers/schemeController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Public catalogue (no login needed, like articles). ?lang=en|hi|mr
router.get('/', listSchemes);
router.get('/stats', getSchemeStats);
router.post('/translate', authMiddleware, requireAdmin, runTranslation);
router.get('/:slug', getScheme);

export default router;
