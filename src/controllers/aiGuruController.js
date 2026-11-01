import {
  AiGuruError,
  sendMessage,
  listSessions,
  getSessionWithMessages,
  updateSession,
  deleteSession,
  deleteAllSessions,
  setMessageFeedback,
  getUsageToday,
} from '../ai-guru/services/aiGuru.service.js';
import * as adminService from '../ai-guru/services/aiGuruAdmin.service.js';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const sendError = (res, error, fallbackMessage) => {
  if (error instanceof AiGuruError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(fallbackMessage, error);

  return res.status(500).json({ success: false, message: fallbackMessage });
};

/*
|--------------------------------------------------------------------------
| USER — CHAT
|--------------------------------------------------------------------------
*/

/*
 * POST /api/ai-guru/chat
 * Body: { message, sessionId?, fieldId?, language?, source?, image? }
 */
export const chat = async (req, res) => {
  try {
    const { message, sessionId, fieldId, language, source, image } = req.body || {};

    const result = await sendMessage({
      userId: req.user.userId,
      sessionId,
      message,
      fieldId,
      language,
      source,
      image,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Failed to get a reply from AI Guru');
  }
};

export const getSessions = async (req, res) => {
  try {
    const result = await listSessions(req.user.userId, req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Failed to load chats');
  }
};

export const getSession = async (req, res) => {
  try {
    const result = await getSessionWithMessages(req.user.userId, req.params.sessionId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Failed to load chat');
  }
};

export const patchSession = async (req, res) => {
  try {
    const session = await updateSession(req.user.userId, req.params.sessionId, req.body || {});
    return res.status(200).json({ success: true, session });
  } catch (error) {
    return sendError(res, error, 'Failed to update chat');
  }
};

export const removeSession = async (req, res) => {
  try {
    await deleteSession(req.user.userId, req.params.sessionId);
    return res.status(200).json({ success: true, message: 'Chat deleted' });
  } catch (error) {
    return sendError(res, error, 'Failed to delete chat');
  }
};

export const removeAllSessions = async (req, res) => {
  try {
    const deleted = await deleteAllSessions(req.user.userId);
    return res.status(200).json({ success: true, deleted, message: 'Chat history cleared' });
  } catch (error) {
    return sendError(res, error, 'Failed to clear chat history');
  }
};

export const postFeedback = async (req, res) => {
  try {
    const message = await setMessageFeedback(req.user.userId, req.params.messageId, req.body || {});
    return res.status(200).json({ success: true, message });
  } catch (error) {
    return sendError(res, error, 'Failed to save feedback');
  }
};

export const getUsage = async (req, res) => {
  try {
    const usage = await getUsageToday(req.user.userId);
    return res.status(200).json({ success: true, usage });
  } catch (error) {
    return sendError(res, error, 'Failed to load usage');
  }
};

/*
|--------------------------------------------------------------------------
| ADMIN PANEL
|--------------------------------------------------------------------------
*/

export const adminListSessions = async (req, res) => {
  try {
    const result = await adminService.listSessions(req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Failed to load chats');
  }
};

export const adminGetSession = async (req, res) => {
  try {
    const result = await adminService.getSession(req.params.sessionId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Failed to load chat');
  }
};

export const adminPurgeSession = async (req, res) => {
  try {
    const result = await adminService.purgeSession(req.params.sessionId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Failed to delete chat');
  }
};

export const adminListUsers = async (req, res) => {
  try {
    const result = await adminService.listUsers(req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Failed to load users');
  }
};

export const adminListMessages = async (req, res) => {
  try {
    const result = await adminService.listMessages(req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, 'Failed to load messages');
  }
};

export const adminGetStats = async (req, res) => {
  try {
    const stats = await adminService.getStats(req.query);
    return res.status(200).json({ success: true, stats });
  } catch (error) {
    return sendError(res, error, 'Failed to load AI Guru stats');
  }
};
