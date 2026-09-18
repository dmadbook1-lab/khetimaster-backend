import express from 'express';

import {
  latestArticles,
  articleStats,
  refreshArticlesManually,
} from '../controllers/articleController.js';

const router = express.Router();

router.get(
  '/latest',
  latestArticles
);

router.get(
  '/stats',
  articleStats
);

router.post(
  '/refresh',
  refreshArticlesManually
);

export default router;