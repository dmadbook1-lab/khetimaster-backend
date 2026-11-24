import mongoose from 'mongoose';

import User from '../models/User.js';
import Otp from '../models/Otp.js';
import RefreshToken from '../models/RefreshToken.js';
import FarmField from '../models/farmField.model.js';
import FarmAdvisory from '../advisory/models/farmAdvisory.model.js';
import Labourer from '../models/Labourer.js';
import LabourBooking from '../models/LabourBooking.js';
import Machinery from '../models/Machinery.js';
import MachineryBooking from '../models/MachineryBooking.js';
import Doctor from '../models/Doctor.js';
import DoctorConsultation from '../models/DoctorConsultation.js';
import Plant from '../models/Plant.js';
import NurseryCart from '../models/NurseryCart.js';
import NurseryOrder from '../models/NurseryOrder.js';
import MarketListing from '../models/MarketListing.js';
import MarketDeal from '../models/MarketDeal.js';
import MarketSavedListing from '../models/MarketSavedListing.js';
import CommunityPost from '../models/CommunityPost.js';
import CommunityComment from '../models/CommunityComment.js';
import CommunityReaction from '../models/CommunityReaction.js';
import CommunityFollow from '../models/CommunityFollow.js';
import ArticleCache from '../models/ArticleCache.js';
import Scheme from '../models/Scheme.js';
import SoilTest from '../models/SoilTest.js';
import AiChatSession from '../models/AiChatSession.js';
import AiChatMessage from '../models/AiChatMessage.js';

import { RESOURCES, USER_FIELDS } from './adminResources.js';

/*
|--------------------------------------------------------------------------
| ADMIN PANEL — QUERIES
|--------------------------------------------------------------------------
*/

export class AdminError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const ADMIN_MAX_LIMIT = 1000;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function paging({ page, limit }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), ADMIN_MAX_LIMIT);
  const safePage = Math.max(Number(page) || 1, 1);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

const paginationOf = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.max(Math.ceil(total / limit), 1),
});

function dateRange({ from, to }, field = 'createdAt') {
  const range = {};
  if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to);
    // A bare date means "through the end of that day"
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? { [field]: range } : {};
}

/*
 * ?sort=field or ?sort=-field, limited to the resource's sortable fields.
 */
function sortOf(sort, sortable = [], fallback = { createdAt: -1 }) {
  if (!sort) return fallback;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return sortable.includes(field) ? { [field]: desc ? -1 : 1, _id: -1 } : fallback;
}

const assertId = (id, what = 'record') => {
  if (!mongoose.isObjectIdOrHexString(id)) throw new AdminError(`Invalid ${what} id.`);
};

const isSet = (value) => value !== undefined && value !== '' && value !== 'all';

async function userIdsMatching(search) {
  const pattern = new RegExp(escapeRegex(search), 'i');
  const users = await User.find({
    $or: [{ fullName: pattern }, { email: pattern }, { phoneNumber: pattern }],
  })
    .select('_id')
    .limit(500)
    .lean();
  return users.map((u) => u._id);
}

function resourceOf(name) {
  const resource = RESOURCES[name];
  if (!resource) throw new AdminError('Unknown resource.', 404);
  return resource;
}

/*
|--------------------------------------------------------------------------
| GENERIC RESOURCES
|--------------------------------------------------------------------------
*/

export async function listResource(name, query = {}) {
  const resource = resourceOf(name);
  const { page, limit, skip } = paging(query);
  const filter = { ...dateRange(query) };

  for (const key of resource.filters || []) {
    if (!isSet(query[key])) continue;

    // Mongoose casts ids for ref fields, so plain values work for every filter
    filter[key] = resource.booleans?.includes(key) ? String(query[key]) === 'true' : query[key];
  }

  if (isSet(query.search)) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const or = (resource.search || []).map((field) => ({ [field]: pattern }));

    const userIds =
      resource.searchUsers?.length || resource.searchRelated?.some((r) => r.userField)
        ? await userIdsMatching(query.search)
        : [];

    if (userIds.length) resource.searchUsers?.forEach((field) => or.push({ [field]: { $in: userIds } }));

    for (const related of resource.searchRelated || []) {
      const relatedOr = related.search.map((field) => ({ [field]: pattern }));
      if (related.userField && userIds.length) relatedOr.push({ [related.userField]: { $in: userIds } });

      const ids = await related.model.find({ $or: relatedOr }).select('_id').limit(1000).lean();
      if (ids.length) or.push({ [related.field]: { $in: ids.map((doc) => doc._id) } });
    }

    if (mongoose.isObjectIdOrHexString(query.search)) or.push({ _id: query.search });

    filter.$or = or.length ? or : [{ _id: null }];
  }

  let finder = resource.model
    .find(filter)
    .sort(sortOf(query.sort, resource.sortable, resource.defaultSort))
    .skip(skip)
    .limit(limit);

  for (const populate of resource.populate || []) finder = finder.populate(populate);

  const [items, total] = await Promise.all([
    finder.lean(),
    resource.model.countDocuments(filter),
  ]);

  return { items, pagination: paginationOf(page, limit, total) };
}

export async function getResource(name, id) {
  const resource = resourceOf(name);
  assertId(id);

  let finder = resource.model.findById(id);
  for (const populate of resource.populate || []) finder = finder.populate(populate);

  const item = await finder.lean();
  if (!item) throw new AdminError(`${resource.label} not found.`, 404);

  const extra = {};

  if (name === 'farms') {
    extra.advisories = await FarmAdvisory.find({ farmFieldId: id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
  }

  if (name === 'community-posts') {
    extra.comments = await CommunityComment.find({ post: id })
      .populate('author', USER_FIELDS)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  }

  return { item, ...extra };
}

export async function updateResource(name, id, body = {}) {
  if (name === 'nursery-orders' && body.orderStatus) return updateNurseryOrder(id, body);

  const resource = resourceOf(name);
  assertId(id);

  if (resource.readOnly || !resource.editable?.length) {
    throw new AdminError(`${resource.label} records cannot be edited.`, 405);
  }

  const doc = await resource.model.findById(id);
  if (!doc) throw new AdminError(`${resource.label} not found.`, 404);

  const changes = {};
  for (const key of resource.editable) {
    if (body[key] !== undefined) changes[key] = body[key];
  }
  if (!Object.keys(changes).length) throw new AdminError('Nothing to update.');

  if (changes.status && resource.statuses && !resource.statuses.includes(changes.status)) {
    throw new AdminError('Invalid status.');
  }

  const previous = doc.toObject();

  resource.beforeUpdate?.(doc, { ...body, ...changes });
  doc.set(changes);

  try {
    await doc.save();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) throw new AdminError(error.message);
    throw error;
  }

  await resource.afterUpdate?.(doc, previous);

  return getResource(name, id);
}

export async function deleteResource(name, id) {
  const resource = resourceOf(name);
  assertId(id);

  if (resource.readOnly) throw new AdminError(`${resource.label} records cannot be deleted.`, 405);

  const doc = await resource.model.findById(id);
  if (!doc) throw new AdminError(`${resource.label} not found.`, 404);

  await resource.beforeDelete?.(doc);
  await doc.deleteOne();

  return { deletedId: id };
}

/*
|--------------------------------------------------------------------------
| NURSERY ORDERS
|--------------------------------------------------------------------------
|
| Items carry their own status (each seller moves theirs). An admin status
| change moves every item that is not already cancelled, then restores
| stock / counts sales exactly like the seller flow does.
|
*/

const ORDER_FLOW = ['PENDING', 'CONFIRMED', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

async function updateNurseryOrder(id, { orderStatus, cancellationReason, paymentStatus }) {
  assertId(id, 'order');

  if (![...ORDER_FLOW, 'CANCELLED'].includes(orderStatus)) {
    throw new AdminError('Invalid order status.');
  }

  const order = await NurseryOrder.findById(id);
  if (!order) throw new AdminError('Order not found.', 404);

  if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'DELIVERED') {
    throw new AdminError(`This order is already ${order.orderStatus.toLowerCase()}.`, 409);
  }

  const restock = [];
  const delivered = [];

  for (const item of order.items) {
    const current = item.status || order.orderStatus;
    if (current === 'CANCELLED') continue;

    if (orderStatus === 'CANCELLED') restock.push(item);
    if (orderStatus === 'DELIVERED' && current !== 'DELIVERED') delivered.push(item);

    item.status = orderStatus;
  }

  order.orderStatus = orderStatus;

  if (orderStatus === 'CANCELLED') {
    order.cancellationReason = String(cancellationReason || 'Cancelled by admin').slice(0, 500);
  }
  if (orderStatus === 'DELIVERED') {
    order.deliveredAt = order.deliveredAt || new Date();
    if (order.paymentMethod === 'COD') order.paymentStatus = 'PAID';
  }
  if (paymentStatus) order.paymentStatus = paymentStatus;

  await order.save();

  for (const item of restock) {
    await Plant.updateOne({ _id: item.plant }, { $inc: { quantity: item.quantity } });
  }
  for (const item of delivered) {
    await Plant.updateOne({ _id: item.plant }, { $inc: { totalSold: item.quantity } });
  }

  return getResource('nursery-orders', id);
}

/*
|--------------------------------------------------------------------------
| USERS
|--------------------------------------------------------------------------
*/

const USER_EDITABLE = ['fullName', 'phoneNumber', 'state', 'district', 'taluka', 'village', 'bio'];

/*
 * Farm count, total acres, provider profiles and last login for a page of users.
 */
async function userSummaries(userIds) {
  const [farms, labourers, doctors, machines, logins] = await Promise.all([
    FarmField.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: '$user', count: { $sum: 1 }, acres: { $sum: '$acre' } } },
    ]),
    Labourer.find({ user: { $in: userIds } }).select('user').lean(),
    Doctor.find({ user: { $in: userIds } }).select('user').lean(),
    Machinery.aggregate([
      { $match: { owner: { $in: userIds } } },
      { $group: { _id: '$owner', count: { $sum: 1 } } },
    ]),
    // Every login / token refresh creates a refresh token
    RefreshToken.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', lastLoginAt: { $max: '$createdAt' } } },
    ]),
  ]);

  const byId = (rows) => new Map(rows.map((row) => [String(row._id), row]));
  const farmMap = byId(farms);
  const machineMap = byId(machines);
  const loginMap = byId(logins);
  const labourerSet = new Set(labourers.map((l) => String(l.user)));
  const doctorSet = new Set(doctors.map((d) => String(d.user)));

  return (id) => {
    const key = String(id);
    return {
      farmsCount: farmMap.get(key)?.count || 0,
      totalAcres: Number((farmMap.get(key)?.acres || 0).toFixed(2)),
      machineryCount: machineMap.get(key)?.count || 0,
      isLabourer: labourerSet.has(key),
      isDoctor: doctorSet.has(key),
      lastLoginAt: loginMap.get(key)?.lastLoginAt || null,
    };
  };
}

export async function listUsers(query = {}) {
  const { page, limit, skip } = paging(query);
  const filter = { ...dateRange(query) };

  if (isSet(query.role)) filter.role = query.role;
  if (isSet(query.profileCompleted)) filter.profileCompleted = query.profileCompleted === 'true';
  if (isSet(query.state)) filter.state = query.state;
  if (isSet(query.district)) filter.district = query.district;

  if (isSet(query.search)) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = ['fullName', 'email', 'phoneNumber', 'village', 'district', 'state'].map(
      (field) => ({ [field]: pattern })
    );
    if (mongoose.isObjectIdOrHexString(query.search)) filter.$or.push({ _id: query.search });
  }

  const sort = sortOf(query.sort, ['createdAt', 'fullName', 'email', 'state', 'role']);

  const [users, total] = await Promise.all([
    User.find(filter).select('-__v').sort(sort).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  const summaryOf = await userSummaries(users.map((u) => u._id));
  const items = users.map((user) => ({ ...user, ...summaryOf(user._id) }));

  return { items, pagination: paginationOf(page, limit, total) };
}

/*
 * Everything the app knows about one user.
 */
export async function getUser(id) {
  assertId(id, 'user');

  const user = await User.findById(id).select('-__v').lean();
  if (!user) throw new AdminError('User not found.', 404);

  const userId = user._id;
  const recent = (finder, n = 50) => finder.sort({ createdAt: -1 }).limit(n).lean();

  const [labourer, doctor, farms, machinery, plants, listings] = await Promise.all([
    Labourer.findOne({ user: userId }).lean(),
    Doctor.findOne({ user: userId }).lean(),
    recent(FarmField.find({ user: userId }), 200),
    recent(Machinery.find({ owner: userId })),
    recent(Plant.find({ 'seller.userId': userId })),
    recent(MarketListing.find({ seller: userId, status: { $ne: 'DELETED' } })),
  ]);

  const farmIds = farms.map((f) => f._id);
  const machineIds = machinery.map((m) => m._id);

  const [
    latestAdvisories,
    labourBookings,
    labourJobs,
    machineryBookings,
    machineryJobs,
    consultations,
    doctorCases,
    nurseryOrders,
    nurserySales,
    deals,
    posts,
    followers,
    following,
    commentsCount,
    aiSessions,
    aiUsage,
    lastLogin,
  ] = await Promise.all([
    FarmAdvisory.aggregate([
      { $match: { farmFieldId: { $in: farmIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$farmFieldId', advisory: { $first: '$$ROOT' }, count: { $sum: 1 } } },
    ]),
    recent(LabourBooking.find({ farmer: userId }).populate('labourer', 'fullName labourType')),
    labourer
      ? recent(LabourBooking.find({ labourer: labourer._id }).populate('farmer', USER_FIELDS))
      : [],
    recent(MachineryBooking.find({ farmer: userId }).populate('machinery', 'name category')),
    machineIds.length
      ? recent(
          MachineryBooking.find({ machinery: { $in: machineIds } })
            .populate('farmer', USER_FIELDS)
            .populate('machinery', 'name category')
        )
      : [],
    recent(DoctorConsultation.find({ farmer: userId }).populate('doctor', 'fullName doctorType')),
    doctor
      ? recent(DoctorConsultation.find({ doctor: doctor._id }).populate('farmer', USER_FIELDS))
      : [],
    recent(NurseryOrder.find({ user: userId })),
    recent(NurseryOrder.find({ 'items.seller.userId': userId }).populate('user', USER_FIELDS)),
    recent(
      MarketDeal.find({ $or: [{ buyer: userId }, { seller: userId }] })
        .populate('buyer', USER_FIELDS)
        .populate('seller', USER_FIELDS)
    ),
    recent(CommunityPost.find({ author: userId })),
    CommunityFollow.countDocuments({ following: userId }),
    CommunityFollow.countDocuments({ follower: userId }),
    CommunityComment.countDocuments({ author: userId }),
    recent(AiChatSession.find({ user: userId }).populate('farmField', 'fieldName cropName'), 30),
    AiChatSession.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: null,
          sessions: { $sum: 1 },
          messages: { $sum: '$messageCount' },
          tokens: { $sum: '$usage.totalTokens' },
        },
      },
    ]),
    RefreshToken.findOne({ userId }).sort({ createdAt: -1 }).select('createdAt').lean(),
  ]);

  const advisoryByFarm = new Map(latestAdvisories.map((row) => [String(row._id), row]));
  const farmsWithAdvisory = farms.map((farm) => {
    const row = advisoryByFarm.get(String(farm._id));
    return { ...farm, latestAdvisory: row?.advisory || null, advisoriesCount: row?.count || 0 };
  });

  const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

  return {
    user: { ...user, lastLoginAt: lastLogin?.createdAt || null },
    stats: {
      farms: farms.length,
      totalAcres: Number(sum(farms, 'acre').toFixed(2)),
      bookingsMade: labourBookings.length + machineryBookings.length + consultations.length,
      jobsReceived: labourJobs.length + machineryJobs.length + doctorCases.length,
      nurseryOrders: nurseryOrders.length,
      nurserySpend: sum(
        nurseryOrders.filter((o) => o.orderStatus !== 'CANCELLED'),
        'total'
      ),
      listings: listings.length,
      deals: deals.length,
      posts: posts.length,
      comments: commentsCount,
      followers,
      following,
      aiSessions: aiUsage[0]?.sessions || 0,
      aiMessages: aiUsage[0]?.messages || 0,
      aiTokens: aiUsage[0]?.tokens || 0,
    },
    farms: farmsWithAdvisory,
    profiles: { labourer, doctor },
    machinery,
    plants,
    listings,
    bookings: { labour: labourBookings, machinery: machineryBookings, doctor: consultations },
    jobs: { labour: labourJobs, machinery: machineryJobs, doctor: doctorCases },
    nursery: { orders: nurseryOrders, sales: nurserySales },
    deals,
    community: { posts },
    aiGuru: { sessions: aiSessions },
  };
}

export async function updateUser(id, body = {}, adminId) {
  assertId(id, 'user');

  const user = await User.findById(id);
  if (!user) throw new AdminError('User not found.', 404);

  for (const key of USER_EDITABLE) {
    if (body[key] !== undefined) user[key] = String(body[key]).trim();
  }

  if (body.role !== undefined) {
    if (!['user', 'admin'].includes(body.role)) throw new AdminError('Invalid role.');
    if (String(id) === String(adminId) && body.role !== 'admin') {
      throw new AdminError('You cannot remove your own admin access.', 403);
    }
    user.role = body.role;
  }

  if (body.phoneNumber) {
    const taken = await User.exists({ phoneNumber: user.phoneNumber, _id: { $ne: user._id } });
    if (taken) throw new AdminError('Another user already has this phone number.', 409);
  }

  try {
    await user.save();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) throw new AdminError(error.message);
    throw error;
  }

  return { user: user.toObject() };
}

/*
 * Deletes the account and everything it owns. Bookings, orders and deals
 * with other users stay as their history (they show a deleted user).
 */
export async function deleteUser(id, adminId) {
  assertId(id, 'user');

  if (String(id) === String(adminId)) {
    throw new AdminError('You cannot delete your own account.', 403);
  }

  const user = await User.findById(id);
  if (!user) throw new AdminError('User not found.', 404);

  const userId = user._id;

  const [farmIds, postIds, sessionIds] = await Promise.all([
    FarmField.find({ user: userId }).distinct('_id'),
    CommunityPost.find({ author: userId }).distinct('_id'),
    AiChatSession.find({ user: userId }).distinct('_id'),
  ]);

  // Keep like / save / comment counters right on other people's posts
  const [reactions, comments] = await Promise.all([
    CommunityReaction.find({ user: userId, post: { $nin: postIds } }).lean(),
    CommunityComment.aggregate([
      { $match: { author: userId, post: { $nin: postIds } } },
      { $group: { _id: '$post', count: { $sum: 1 } } },
    ]),
  ]);

  for (const reaction of reactions) {
    const counter = reaction.kind === 'like' ? 'likesCount' : 'savesCount';
    await CommunityPost.updateOne(
      { _id: reaction.post, [counter]: { $gt: 0 } },
      { $inc: { [counter]: -1 } }
    );
  }
  for (const row of comments) {
    await CommunityPost.updateOne(
      { _id: row._id },
      [{ $set: { commentsCount: { $max: [0, { $subtract: ['$commentsCount', row.count] }] } } }],
      { updatePipeline: true }
    );
  }

  await Promise.all([
    FarmAdvisory.deleteMany({ farmFieldId: { $in: farmIds } }),
    FarmField.deleteMany({ user: userId }),
    Labourer.deleteMany({ user: userId }),
    Doctor.deleteMany({ user: userId }),
    Machinery.deleteMany({ owner: userId }),
    Plant.deleteMany({ 'seller.userId': userId }),
    NurseryCart.deleteMany({ user: userId }),
    MarketSavedListing.deleteMany({ user: userId }),
    MarketListing.updateMany({ seller: userId }, { $set: { status: 'DELETED' } }),
    CommunityComment.deleteMany({ $or: [{ author: userId }, { post: { $in: postIds } }] }),
    CommunityReaction.deleteMany({ $or: [{ user: userId }, { post: { $in: postIds } }] }),
    CommunityPost.deleteMany({ author: userId }),
    CommunityFollow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
    AiChatMessage.deleteMany({ session: { $in: sessionIds } }),
    AiChatSession.deleteMany({ user: userId }),
    SoilTest.deleteMany({ user: userId }),
    RefreshToken.deleteMany({ userId }),
    Otp.deleteMany({ email: user.email }),
  ]);

  await user.deleteOne();

  return { deletedId: id };
}

/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

const monthKey = { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } };

function lastMonths(count) {
  const months = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

const countByMonth = (Model, since, match = {}) =>
  Model.aggregate([
    { $match: { ...match, createdAt: { $gte: since } } },
    { $group: { _id: monthKey, count: { $sum: 1 } } },
  ]);

const countBy = (Model, field, match = {}) =>
  Model.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

const sumOf = async (Model, field, match) => {
  const [row] = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return row?.total || 0;
};

const toCounts = (rows) =>
  Object.fromEntries(rows.map((row) => [row._id ?? 'unknown', row.count]));

export async function getDashboard() {
  const months = lastMonths(12);
  const since = new Date(`${months[0]}-01T00:00:00+05:30`);
  const startOfMonth = new Date(`${months[months.length - 1]}-01T00:00:00+05:30`);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    users,
    usersThisMonth,
    usersThisWeek,
    profilesCompleted,
    activeUsers,
    farms,
    acres,
    labourers,
    machinery,
    doctors,
    plants,
    activeListings,
    posts,
    articles,
    schemes,
    soilTests,
    soilTestStatus,
    aiSessions,
    aiMessages,
    labourStatus,
    machineryStatus,
    doctorStatus,
    nurseryStatus,
    dealStatus,
    gmvLabour,
    gmvMachinery,
    gmvDoctor,
    gmvNursery,
    gmvMarket,
    signups,
    farmsAdded,
    bookingsByMonth,
    machineryByMonth,
    consultsByMonth,
    ordersByMonth,
    usersByState,
    crops,
    farmingTypes,
    healthCategories,
    recentUsers,
    farmPoints,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    User.countDocuments({ createdAt: { $gte: weekAgo } }),
    User.countDocuments({ profileCompleted: true }),
    RefreshToken.distinct('userId', { createdAt: { $gte: weekAgo } }).then((ids) => ids.length),
    FarmField.countDocuments(),
    sumOf(FarmField, 'acre', {}),
    Labourer.countDocuments(),
    Machinery.countDocuments(),
    Doctor.countDocuments(),
    Plant.countDocuments(),
    MarketListing.countDocuments({ status: 'ACTIVE' }),
    CommunityPost.countDocuments(),
    ArticleCache.countDocuments(),
    Scheme.countDocuments({ isActive: true }),
    SoilTest.countDocuments(),
    countBy(SoilTest, 'status'),
    AiChatSession.countDocuments(),
    AiChatMessage.countDocuments({ role: 'user' }),
    countBy(LabourBooking, 'status'),
    countBy(MachineryBooking, 'status'),
    countBy(DoctorConsultation, 'status'),
    countBy(NurseryOrder, 'orderStatus'),
    countBy(MarketDeal, 'status'),
    sumOf(LabourBooking, 'totalAmount', { status: 'completed' }),
    sumOf(MachineryBooking, 'totalAmount', { status: 'completed' }),
    sumOf(DoctorConsultation, 'totalAmount', { status: 'completed' }),
    sumOf(NurseryOrder, 'total', { orderStatus: 'DELIVERED' }),
    sumOf(MarketDeal, 'totalAmount', { status: 'COMPLETED' }),
    countByMonth(User, since),
    countByMonth(FarmField, since),
    countByMonth(LabourBooking, since),
    countByMonth(MachineryBooking, since),
    countByMonth(DoctorConsultation, since),
    countByMonth(NurseryOrder, since),
    countBy(User, 'state', { state: { $nin: ['', null] } }).limit(10),
    countBy(FarmField, 'cropName', { cropName: { $nin: ['', null] } }).limit(10),
    countBy(FarmField, 'typeOfFarming'),
    FarmAdvisory.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$farmFieldId', category: { $first: '$cropHealth.category' } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    User.find().select(USER_FIELDS + ' createdAt profileCompleted role').sort({ createdAt: -1 }).limit(6).lean(),
    FarmField.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 2000 },
      {
        $project: {
          fieldName: 1,
          cropName: 1,
          acre: 1,
          lat: { $avg: '$field.lat' },
          lng: { $avg: '$field.lng' },
        },
      },
      { $match: { lat: { $ne: null }, lng: { $ne: null } } },
    ]),
  ]);

  const series = (rows) => {
    const map = new Map(rows.map((row) => [row._id, row.count]));
    return months.map((month) => map.get(month) || 0);
  };

  const signupSeries = series(signups);
  const farmSeries = series(farmsAdded);
  const labourSeries = series(bookingsByMonth);
  const machinerySeries = series(machineryByMonth);
  const doctorSeries = series(consultsByMonth);
  const orderSeries = series(ordersByMonth);

  return {
    totals: {
      users,
      usersThisMonth,
      usersThisWeek,
      profilesCompleted,
      activeUsers7d: activeUsers,
      farms,
      totalAcres: Number(acres.toFixed(2)),
      labourers,
      machinery,
      doctors,
      plants,
      activeListings,
      posts,
      articles,
      schemes,
      soilTests,
      aiSessions,
      aiQuestions: aiMessages,
    },
    statuses: {
      labourBookings: toCounts(labourStatus),
      machineryBookings: toCounts(machineryStatus),
      doctorConsultations: toCounts(doctorStatus),
      nurseryOrders: toCounts(nurseryStatus),
      marketDeals: toCounts(dealStatus),
      soilTests: toCounts(soilTestStatus),
    },
    gmv: {
      labour: gmvLabour,
      machinery: gmvMachinery,
      doctor: gmvDoctor,
      nursery: gmvNursery,
      market: gmvMarket,
      total: gmvLabour + gmvMachinery + gmvDoctor + gmvNursery + gmvMarket,
    },
    monthly: months.map((month, i) => ({
      month,
      users: signupSeries[i],
      farms: farmSeries[i],
      labourBookings: labourSeries[i],
      machineryBookings: machinerySeries[i],
      consultations: doctorSeries[i],
      nurseryOrders: orderSeries[i],
    })),
    usersByState: usersByState.map((row) => ({ state: row._id, count: row.count })),
    crops: crops.map((row) => ({ crop: row._id, count: row.count })),
    farmingTypes: toCounts(farmingTypes),
    cropHealth: toCounts(healthCategories),
    recentUsers,
    farmPoints,
  };
}

/*
 * Distinct values for filter dropdowns (states, crops, categories, ...).
 */
const OPTION_SOURCES = {
  'users.state': [User, 'state'],
  'users.district': [User, 'district'],
  'farms.cropName': [FarmField, 'cropName'],
  'farms.typeOfIrrigation': [FarmField, 'typeOfIrrigation'],
  'labourers.labourType': [Labourer, 'labourType'],
  'labourers.state': [Labourer, 'state'],
  'machinery.category': [Machinery, 'category'],
  'machinery.state': [Machinery, 'state'],
  'doctors.state': [Doctor, 'state'],
  'plants.category': [Plant, 'category'],
  'articles.category': [ArticleCache, 'category'],
  'schemes.category': [Scheme, 'category'],
  'schemes.level': [Scheme, 'level'],
  'soil-tests.state': [SoilTest, 'state'],
};

export async function getOptions(key) {
  const source = OPTION_SOURCES[key];
  if (!source) throw new AdminError('Unknown option list.', 404);

  const [Model, field] = source;
  const values = await Model.distinct(field);

  return {
    values: values.filter((v) => v !== '' && v !== null && v !== undefined).sort(),
  };
}
