import express from 'express';

import {
  getDashboard,
  getOptions,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  listResource,
  getResource,
  updateResource,
  deleteResource,
  refreshArticlesNow,
  refreshSoilTest,
  syncSoilTests,
  getSoilTestSummary,
  getSchemeSummary,
  translateSchemesNow,
} from '../controllers/adminController.js';

import authMiddleware from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

/*
|--------------------------------------------------------------------------
| ADMIN PANEL (admins only)
|--------------------------------------------------------------------------
|
| GET    /api/admin/dashboard
| GET    /api/admin/options/:key                 distinct values for filters
|
| GET    /api/admin/users?page&limit&search&role&state&profileCompleted&from&to&sort
| GET    /api/admin/users/:id                    profile + everything the user owns
| PATCH  /api/admin/users/:id                    profile fields, role
| DELETE /api/admin/users/:id                    account + owned content
|
| POST   /api/admin/articles/refresh
|
| GET    /api/admin/soil-tests/summary
| POST   /api/admin/soil-tests/sync               check every booked test for a report
| POST   /api/admin/soil-tests/:id/refresh        check one test now
|
| GET    /api/admin/schemes/summary
| POST   /api/admin/schemes/translate?force=1     (re)translate to Hindi / Marathi
|
| GET    /api/admin/:resource?page&limit&search&from&to&sort&<filters>
| GET    /api/admin/:resource/:id
| PATCH  /api/admin/:resource/:id
| DELETE /api/admin/:resource/:id
|
| Resources are listed in src/admin/adminResources.js. AI Guru has its own
| admin routes under /api/admin/ai-guru.
|
*/

const router = express.Router();

router.use(authMiddleware, requireAdmin);

router.get('/dashboard', getDashboard);

router.get('/options/:key', getOptions);

router.get('/users', listUsers);

router.get('/users/:id', getUser);

router.patch('/users/:id', updateUser);

router.delete('/users/:id', deleteUser);

router.post('/articles/refresh', refreshArticlesNow);

router.get('/soil-tests/summary', getSoilTestSummary);

router.post('/soil-tests/sync', syncSoilTests);

router.post('/soil-tests/:id/refresh', refreshSoilTest);

router.get('/schemes/summary', getSchemeSummary);

router.post('/schemes/translate', translateSchemesNow);

router.get('/:resource', listResource);

router.get('/:resource/:id', getResource);

router.patch('/:resource/:id', updateResource);

router.delete('/:resource/:id', deleteResource);

export default router;
