import mongoose from 'mongoose';

import User from '../../models/User.js';
import FarmField from '../../models/farmField.model.js';
import AiChatSession from '../../models/AiChatSession.js';
import AiChatMessage from '../../models/AiChatMessage.js';
import { normalizeAdvisoryLanguage } from '../../advisory/utils/i18n/advisoryLanguages.js';
import { askAiGuru } from '../core/agent.js';
import { buildSystemPrompt } from '../core/systemPrompt.js';

/*
|--------------------------------------------------------------------------
| AI GURU SERVICE
|--------------------------------------------------------------------------
|
| Loads the conversation from MongoDB, runs the agent with the farmer's
| profile + farms, and stores both sides of the exchange with token usage
| so the admin panel can review chats and cost.
|
*/

/** Earlier turns sent to the model (same window as CropGen). */
const MAX_HISTORY_MESSAGES = 16;

const MAX_MESSAGE_CHARS = 2000;

/** ~4 MB of base64 ≈ 3 MB image. The app resizes photos well below this. */
const MAX_IMAGE_CHARS = 4 * 1024 * 1024;

const IMAGE_ONLY_PROMPT =
  'Please look at this photo from my farm. What is the problem and what should I do?';

const SOURCES = ['aiguru', 'voice', 'farm', 'disease', 'mandi', 'community', 'other'];

const dailyLimit = () => Number(process.env.AI_GURU_DAILY_MESSAGE_LIMIT) || 100;

export class AiGuruError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const isId = (value) => mongoose.isValidObjectId(value);

/** Start of today in India, as a Date. */
function startOfIndianDay() {
  const ist = new Date(Date.now() + 5.5 * 3600000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600000);
}

function normalizeImage(image) {
  if (!image) return null;

  const dataUrl =
    typeof image === 'string'
      ? image
      : image.base64
        ? `data:${image.mimeType || 'image/jpeg'};base64,${image.base64}`
        : null;

  if (!dataUrl || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl)) {
    throw new AiGuruError('Photo must be a JPEG, PNG or WEBP image.');
  }

  if (dataUrl.length > MAX_IMAGE_CHARS) {
    throw new AiGuruError('Photo is too large. Please use a smaller photo.', 413);
  }

  return dataUrl;
}

function makeTitle(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean || 'New chat';
}

export function toClientMessage(message) {
  return {
    id: String(message._id),
    role: message.role,
    text: message.text,
    hasImage: Boolean(message.hasImage),
    actions: message.actions || [],
    feedback: message.feedback?.rating || null,
    isError: Boolean(message.isError),
    createdAt: message.createdAt,
  };
}

export function toClientSession(session) {
  return {
    id: String(session._id),
    title: session.title,
    farmField: session.farmField ? String(session.farmField) : null,
    source: session.source,
    language: session.language,
    messageCount: session.messageCount,
    lastMessageAt: session.lastMessageAt,
    lastMessagePreview: session.lastMessagePreview,
    createdAt: session.createdAt,
  };
}

async function findOwnSession(userId, sessionId) {
  if (!isId(sessionId)) throw new AiGuruError('Invalid chat id.');

  const session = await AiChatSession.findOne({
    _id: sessionId,
    user: userId,
    deletedByUser: false,
  });

  if (!session) throw new AiGuruError('Chat not found.', 404);

  return session;
}

async function loadHistory(sessionId) {
  const rows = await AiChatMessage.find({ session: sessionId, isError: false })
    .sort({ createdAt: -1 })
    .limit(MAX_HISTORY_MESSAGES)
    .select('role text hasImage')
    .lean();

  return rows.reverse().map((row) => ({
    role: row.role,
    content: row.hasImage ? `[sent a photo] ${row.text}` : row.text,
  }));
}

/*
|--------------------------------------------------------------------------
| SEND A MESSAGE
|--------------------------------------------------------------------------
*/

/**
 * @param {object} options
 * @param {string} options.userId
 * @param {string} [options.sessionId]  Continue this chat; omit to start a new one
 * @param {string} [options.message]
 * @param {string|null} [options.fieldId]  Farm to talk about; 'general' clears it
 * @param {string} [options.language]
 * @param {string} [options.source]  Screen the question came from
 * @param {string|object} [options.image]  data: URL or { base64, mimeType }
 */
export async function sendMessage({
  userId,
  sessionId,
  message,
  fieldId,
  language,
  source,
  image,
}) {
  const imageDataUrl = normalizeImage(image);
  let text = String(message || '').trim();

  if (!text && !imageDataUrl) throw new AiGuruError('Message is required.');
  if (!text) text = IMAGE_ONLY_PROMPT;
  if (text.length > MAX_MESSAGE_CHARS) {
    throw new AiGuruError(`Message is too long (max ${MAX_MESSAGE_CHARS} characters).`);
  }

  const sentToday = await AiChatMessage.countDocuments({
    user: userId,
    role: 'user',
    createdAt: { $gte: startOfIndianDay() },
  });

  if (sentToday >= dailyLimit()) {
    throw new AiGuruError(
      'You have reached today’s AI Guru limit. Please come back tomorrow.',
      429
    );
  }

  const user = await User.findById(userId).lean();
  if (!user) throw new AiGuruError('User not found.', 404);

  const lang = normalizeAdvisoryLanguage(language || 'en');
  const chatSource = SOURCES.includes(source) ? source : 'aiguru';

  const session = sessionId
    ? await findOwnSession(userId, sessionId)
    : new AiChatSession({
        user: userId,
        title: makeTitle(text),
        source: chatSource,
        language: lang,
      });

  const farms = await FarmField.find({ user: userId }).select('-field').lean();

  if (fieldId !== undefined) {
    const farm =
      fieldId && fieldId !== 'general'
        ? farms.find((item) => String(item._id) === String(fieldId))
        : null;
    session.farmField = farm?._id || null;
  }

  const activeFarm = session.farmField
    ? farms.find((item) => String(item._id) === String(session.farmField)) || null
    : null;

  const history = session.isNew ? [] : await loadHistory(session._id);

  session.language = lang;
  await session.save();

  const userMessage = await AiChatMessage.create({
    session: session._id,
    user: userId,
    role: 'user',
    text,
    hasImage: Boolean(imageDataUrl),
    farmField: activeFarm?._id || null,
    source: chatSource,
    language: lang,
  });

  const startedAt = Date.now();

  const result = await askAiGuru({
    instructions: buildSystemPrompt({ user, farms, activeFarm, language: lang }),
    history,
    text,
    imageDataUrl,
    context: { userId: String(userId), user },
  });

  const reply = await AiChatMessage.create({
    session: session._id,
    user: userId,
    role: 'assistant',
    text: result.text,
    actions: result.actions,
    farmField: activeFarm?._id || null,
    source: chatSource,
    language: lang,
    model: result.model,
    usage: result.usage,
    latencyMs: Date.now() - startedAt,
    toolCalls: result.toolCalls,
    isError: result.isError,
  });

  const updated = await AiChatSession.findByIdAndUpdate(
    session._id,
    {
      $inc: {
        messageCount: 2,
        'usage.inputTokens': result.usage.inputTokens,
        'usage.outputTokens': result.usage.outputTokens,
        'usage.totalTokens': result.usage.totalTokens,
      },
      $set: {
        lastMessageAt: reply.createdAt,
        lastMessagePreview: result.text.slice(0, 140),
      },
    },
    { returnDocument: 'after' }
  ).lean();

  return {
    session: toClientSession(updated),
    userMessage: toClientMessage(userMessage),
    reply: toClientMessage(reply),
    remainingToday: Math.max(0, dailyLimit() - sentToday - 1),
  };
}

/*
|--------------------------------------------------------------------------
| USER CHAT HISTORY
|--------------------------------------------------------------------------
*/

export async function listSessions(userId, { page = 1, limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const filter = { user: userId, deletedByUser: false };

  const [sessions, total] = await Promise.all([
    AiChatSession.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    AiChatSession.countDocuments(filter),
  ]);

  return {
    sessions: sessions.map(toClientSession),
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
  };
}

export async function getSessionWithMessages(userId, sessionId) {
  const session = await findOwnSession(userId, sessionId);

  const messages = await AiChatMessage.find({ session: session._id })
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  return {
    session: toClientSession(session),
    messages: messages.map(toClientMessage),
  };
}

export async function updateSession(userId, sessionId, { title, fieldId }) {
  const session = await findOwnSession(userId, sessionId);

  if (title !== undefined) {
    const clean = String(title).trim();
    if (!clean) throw new AiGuruError('Title cannot be empty.');
    session.title = clean.slice(0, 120);
  }

  if (fieldId !== undefined) {
    if (!fieldId || fieldId === 'general') {
      session.farmField = null;
    } else {
      const farm = isId(fieldId) ? await FarmField.exists({ _id: fieldId, user: userId }) : null;
      if (!farm) throw new AiGuruError('Farm not found.', 404);
      session.farmField = fieldId;
    }
  }

  await session.save();

  return toClientSession(session);
}

/** Hides the chat from the user; it stays visible to admins. */
export async function deleteSession(userId, sessionId) {
  const session = await findOwnSession(userId, sessionId);

  session.deletedByUser = true;
  session.deletedAt = new Date();
  await session.save();
}

export async function deleteAllSessions(userId) {
  const { modifiedCount } = await AiChatSession.updateMany(
    { user: userId, deletedByUser: false },
    { $set: { deletedByUser: true, deletedAt: new Date() } }
  );

  return modifiedCount;
}

export async function setMessageFeedback(userId, messageId, { rating, comment }) {
  if (!isId(messageId)) throw new AiGuruError('Invalid message id.');
  if (![null, 'up', 'down'].includes(rating ?? null)) {
    throw new AiGuruError('Rating must be "up", "down" or null.');
  }

  const message = await AiChatMessage.findOneAndUpdate(
    { _id: messageId, user: userId, role: 'assistant' },
    {
      $set: {
        'feedback.rating': rating ?? null,
        'feedback.comment': String(comment || '').slice(0, 500),
        'feedback.createdAt': rating ? new Date() : null,
      },
    },
    { returnDocument: 'after' }
  ).lean();

  if (!message) throw new AiGuruError('Message not found.', 404);

  return toClientMessage(message);
}

export async function getUsageToday(userId) {
  const sentToday = await AiChatMessage.countDocuments({
    user: userId,
    role: 'user',
    createdAt: { $gte: startOfIndianDay() },
  });

  return { limit: dailyLimit(), used: sentToday, remaining: Math.max(0, dailyLimit() - sentToday) };
}
