import express from 'express';

import authMiddleware from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

import {
  chat,
  getSessions,
  getSession,
  patchSession,
  removeSession,
  removeAllSessions,
  postFeedback,
  getUsage,
  adminListSessions,
  adminGetSession,
  adminPurgeSession,
  adminListUsers,
  adminListMessages,
  adminGetStats,
} from '../controllers/aiGuruController.js';

/*
|--------------------------------------------------------------------------
| AI GURU (logged-in user)
|--------------------------------------------------------------------------
|
| POST   /api/ai-guru/chat
| GET    /api/ai-guru/usage
| GET    /api/ai-guru/sessions
| DELETE /api/ai-guru/sessions
| GET    /api/ai-guru/sessions/:sessionId
| PATCH  /api/ai-guru/sessions/:sessionId
| DELETE /api/ai-guru/sessions/:sessionId
| POST   /api/ai-guru/messages/:messageId/feedback
|
*/

export const aiGuruRouter = express.Router();

aiGuruRouter.use(authMiddleware);

aiGuruRouter.post('/chat', chat);
aiGuruRouter.get('/usage', getUsage);
aiGuruRouter.get('/sessions', getSessions);
aiGuruRouter.delete('/sessions', removeAllSessions);
aiGuruRouter.get('/sessions/:sessionId', getSession);
aiGuruRouter.patch('/sessions/:sessionId', patchSession);
aiGuruRouter.delete('/sessions/:sessionId', removeSession);
aiGuruRouter.post('/messages/:messageId/feedback', postFeedback);

/*
|--------------------------------------------------------------------------
| AI GURU (admin panel)
|--------------------------------------------------------------------------
|
| GET    /api/admin/ai-guru/stats?from&to
| GET    /api/admin/ai-guru/users?page&limit
| GET    /api/admin/ai-guru/sessions?page&limit&userId&source&search&includeDeleted&from&to
| GET    /api/admin/ai-guru/sessions/:sessionId
| DELETE /api/admin/ai-guru/sessions/:sessionId   (permanent)
| GET    /api/admin/ai-guru/messages?role&feedback&isError&userId&search&from&to
|
*/

export const adminAiGuruRouter = express.Router();

adminAiGuruRouter.use(authMiddleware, requireAdmin);

adminAiGuruRouter.get('/stats', adminGetStats);
adminAiGuruRouter.get('/users', adminListUsers);
adminAiGuruRouter.get('/sessions', adminListSessions);
adminAiGuruRouter.get('/sessions/:sessionId', adminGetSession);
adminAiGuruRouter.delete('/sessions/:sessionId', adminPurgeSession);
adminAiGuruRouter.get('/messages', adminListMessages);
