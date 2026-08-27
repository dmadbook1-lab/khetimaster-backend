import express from 'express';

import {
  createLabourer,
  getAllLabourers,
  getMyLabourerProfile,
  getLabourerById,
  updateMyLabourerProfile,
  deactivateMyLabourerProfile,
  activateMyLabourerProfile,
} from '../controllers/labourerController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', authMiddleware, getAllLabourers);
router.post('/', authMiddleware, createLabourer);
router.get('/me', authMiddleware, getMyLabourerProfile);
router.put('/me', authMiddleware, updateMyLabourerProfile);
router.delete('/me', authMiddleware, deactivateMyLabourerProfile);
router.patch('/me/activate', authMiddleware, activateMyLabourerProfile);
router.get('/:id', authMiddleware, getLabourerById);

export default router;
