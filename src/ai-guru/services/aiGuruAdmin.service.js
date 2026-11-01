import mongoose from 'mongoose';

import AiChatSession from '../../models/AiChatSession.js';
import AiChatMessage from '../../models/AiChatMessage.js';
import { AiGuruError } from './aiGuru.service.js';

/*
|--------------------------------------------------------------------------
| AI GURU — ADMIN PANEL QUERIES
|--------------------------------------------------------------------------
|
| Admins see every chat, including the ones users deleted from the app.
|
*/

const USER_FIELDS = 'fullName email phoneNumber state district village';

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

function paging({ page, limit }, max = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), max);
  const safePage = Math.max(Number(page) || 1, 1);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

function dateRange({ from, to }, field = 'createdAt') {
  const range = {};
  if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) range.$lte = new Date(to);
  return Object.keys(range).length ? { [field]: range } : {};
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/*
 * Sessions, newest activity first.
 * Filters: userId, source, includeDeleted, search (title / preview), from, to.
 */
export async function listSessions(query = {}) {
  const { page, limit, skip } = paging(query);
  const filter = { ...dateRange(query, 'lastMessageAt') };

  if (query.userId) {
    if (!mongoose.isValidObjectId(query.userId)) throw new AiGuruError('Invalid user id.');
    filter.user = query.userId;
  }
  if (query.source) filter.source = query.source;
  if (String(query.includeDeleted) !== 'true') filter.deletedByUser = false;
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: pattern }, { lastMessagePreview: pattern }];
  }

  const [sessions, total] = await Promise.all([
    AiChatSession.find(filter)
      .populate('user', USER_FIELDS)
      .populate('farmField', 'fieldName cropName acre')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AiChatSession.countDocuments(filter),
  ]);

  return { sessions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getSession(sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) throw new AiGuruError('Invalid chat id.');

  const session = await AiChatSession.findById(sessionId)
    .populate('user', USER_FIELDS)
    .populate('farmField', 'fieldName cropName variety acre')
    .lean();

  if (!session) throw new AiGuruError('Chat not found.', 404);

  const messages = await AiChatMessage.find({ session: sessionId }).sort({ createdAt: 1 }).lean();

  return { session, messages };
}

/*
 * One row per user who has chatted: sessions, messages, tokens, last activity.
 */
export async function listUsers(query = {}) {
  const { page, limit, skip } = paging(query);

  const [result] = await AiChatSession.aggregate([
    {
      $group: {
        _id: '$user',
        sessions: { $sum: 1 },
        messages: { $sum: '$messageCount' },
        totalTokens: { $sum: '$usage.totalTokens' },
        lastMessageAt: { $max: '$lastMessageAt' },
      },
    },
    { $sort: { lastMessageAt: -1 } },
    {
      $facet: {
        rows: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user',
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    email: 1,
                    phoneNumber: 1,
                    state: 1,
                    district: 1,
                    village: 1,
                  },
                },
              ],
            },
          },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const total = result?.total?.[0]?.count || 0;

  return {
    users: result?.rows || [],
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

/*
 * Messages across all chats, e.g. every thumbs-down reply or failed answer.
 * Filters: role, feedback (up|down), isError, userId, search, from, to.
 */
export async function listMessages(query = {}) {
  const { page, limit, skip } = paging(query);
  const filter = { ...dateRange(query) };

  if (query.role) filter.role = query.role;
  if (query.feedback) filter['feedback.rating'] = query.feedback;
  if (query.isError !== undefined) filter.isError = String(query.isError) === 'true';
  if (query.userId && mongoose.isValidObjectId(query.userId)) filter.user = query.userId;
  if (query.search) filter.text = new RegExp(escapeRegex(query.search), 'i');

  const [messages, total] = await Promise.all([
    AiChatMessage.find(filter)
      .populate('user', USER_FIELDS)
      .populate('session', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AiChatMessage.countDocuments(filter),
  ]);

  return { messages, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/*
 * Dashboard numbers for a period (default: last 30 days).
 */
export async function getStats(query = {}) {
  const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86400000);
  const to = query.to ? new Date(query.to) : new Date();
  const match = { createdAt: { $gte: from, $lte: to } };

  const [totals, perDay, bySource, tools, newSessions] = await Promise.all([
    AiChatMessage.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          questions: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
          replies: { $sum: { $cond: [{ $eq: ['$role', 'assistant'] }, 1, 0] } },
          errors: { $sum: { $cond: ['$isError', 1, 0] } },
          withImage: { $sum: { $cond: ['$hasImage', 1, 0] } },
          thumbsUp: { $sum: { $cond: [{ $eq: ['$feedback.rating', 'up'] }, 1, 0] } },
          thumbsDown: { $sum: { $cond: [{ $eq: ['$feedback.rating', 'down'] }, 1, 0] } },
          inputTokens: { $sum: '$usage.inputTokens' },
          outputTokens: { $sum: '$usage.outputTokens' },
          totalTokens: { $sum: '$usage.totalTokens' },
          avgLatencyMs: {
            $avg: { $cond: [{ $eq: ['$role', 'assistant'] }, '$latencyMs', null] },
          },
          users: { $addToSet: '$user' },
        },
      },
      { $addFields: { activeUsers: { $size: '$users' } } },
      { $project: { _id: 0, users: 0 } },
    ]),
    AiChatMessage.aggregate([
      { $match: { ...match, role: 'user' } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' },
          },
          questions: { $sum: 1 },
          users: { $addToSet: '$user' },
        },
      },
      { $project: { _id: 0, date: '$_id', questions: 1, activeUsers: { $size: '$users' } } },
      { $sort: { date: 1 } },
    ]),
    AiChatMessage.aggregate([
      { $match: { ...match, role: 'user' } },
      { $group: { _id: '$source', questions: { $sum: 1 } } },
      { $project: { _id: 0, source: '$_id', questions: 1 } },
      { $sort: { questions: -1 } },
    ]),
    AiChatMessage.aggregate([
      { $match: { ...match, role: 'assistant' } },
      { $unwind: '$toolCalls' },
      { $group: { _id: '$toolCalls', calls: { $sum: 1 } } },
      { $project: { _id: 0, tool: '$_id', calls: 1 } },
      { $sort: { calls: -1 } },
    ]),
    AiChatSession.countDocuments(match),
  ]);

  const summary = totals[0] || {
    activeUsers: 0,
    questions: 0,
    replies: 0,
    errors: 0,
    withImage: 0,
    thumbsUp: 0,
    thumbsDown: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    avgLatencyMs: null,
  };

  return {
    period: { from, to },
    summary: { ...summary, newSessions },
    perDay,
    bySource,
    tools,
  };
}

/** Permanently removes a chat and its messages. */
export async function purgeSession(sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) throw new AiGuruError('Invalid chat id.');

  const session = await AiChatSession.findByIdAndDelete(sessionId);
  if (!session) throw new AiGuruError('Chat not found.', 404);

  const { deletedCount } = await AiChatMessage.deleteMany({ session: toObjectId(sessionId) });

  return { deletedMessages: deletedCount };
}
