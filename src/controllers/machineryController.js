import mongoose from 'mongoose';

import Machinery from '../models/Machinery.js';
import MachineryBooking from '../models/MachineryBooking.js';
import User from '../models/User.js';

import {
  MACHINERY_CATEGORIES,
  IMPLEMENTS,
  FUEL_TYPES,
  DRIVE_TYPES,
  ENGINE_POWER_UNITS,
  AVAILABILITY_OPTIONS,
  PRICING_TYPES,
  CUSTOM_PRICE_UNITS,
  PAYMENT_METHODS,
  MAX_BOOKING_DAYS,
  MAX_BOOKING_HOURS,
} from '../data/machineryOptions.js';

import { todayInIndia } from '../utils/indiaDate.js';

/*
 * Owner phone numbers are not shown on public listings. They are shared
 * through a booking once the owner confirms it.
 */
const PUBLIC_OWNER_FIELDS = 'fullName village district state';

const MAX_IMAGES = 10;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getAuthenticatedUserId = (req) => req.user?.userId || null;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactInsensitive = (value) => new RegExp(`^${escapeRegex(value.trim())}$`, 'i');

const containsInsensitive = (value) => new RegExp(escapeRegex(value.trim()), 'i');

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const parseDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return new Date(value);
};

const isInvalidDate = (date) => date instanceof Date && Number.isNaN(date.getTime());

const roundMoney = (value) => Math.round(value * 100) / 100;

/*
 * Validates the pricing object. Missing values fall back to the
 * existing pricing on update.
 *
 * Returns { pricing } or { error }.
 */
const buildPricing = (input, existing) => {
  if (!input || typeof input !== 'object') {
    return { error: 'Pricing is required' };
  }

  const pricing = {};

  for (const key of ['hourly', 'daily']) {
    const value = input[key] !== undefined ? parseNumber(input[key]) : (existing?.[key] ?? 0);
    const amount = value ?? 0;

    if (!Number.isFinite(amount) || amount < 0) {
      return { error: `${key === 'hourly' ? 'Hourly' : 'Daily'} price must be a positive number` };
    }

    pricing[key] = roundMoney(amount);
  }

  const customInput = input.custom !== undefined ? input.custom : (existing?.custom ?? []);

  if (!Array.isArray(customInput) || customInput.length > 20) {
    return { error: 'Custom prices must be a list of at most 20 rates' };
  }

  pricing.custom = [];

  for (const rate of customInput) {
    const name = trimString(rate?.name);
    const amount = parseNumber(rate?.amount);
    const unit = rate?.unit || 'custom';

    if (!name) return { error: 'Every custom price needs a name' };

    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      return { error: `Custom price "${name}" needs a valid amount` };
    }

    if (!CUSTOM_PRICE_UNITS.includes(unit)) {
      return { error: `Custom price unit must be one of: ${CUSTOM_PRICE_UNITS.join(', ')}` };
    }

    pricing.custom.push({
      ...(rate._id && isValidId(rate._id) ? { _id: rate._id } : {}),
      name,
      amount: roundMoney(amount),
      unit,
    });
  }

  if (pricing.hourly <= 0 && pricing.daily <= 0 && pricing.custom.length === 0) {
    return { error: 'Set at least one price: hourly, daily or a custom rate' };
  }

  return { pricing };
};

/*
 * Validates machinery fields from the request body.
 *
 * On create the required fields must be present. On update only the
 * fields that were sent are validated and returned.
 *
 * Returns { fields } or { error }.
 */
const buildMachineryFields = (body, { isCreate, existing = null }) => {
  const fields = {};
  const has = (key) => body[key] !== undefined;

  for (const [key, label] of [
    ['ownerName', 'Owner name'],
    ['name', 'Machinery name'],
    ['category', 'Machinery category'],
  ]) {
    if (isCreate || has(key)) {
      const value = trimString(body[key]);

      if (!value) return { error: `${label} is required` };
      if (value.length > 100) return { error: `${label} must be at most 100 characters` };

      fields[key] = value;
    }
  }

  for (const key of ['brand', 'model', 'state', 'district', 'village', 'address', 'ownerNotes']) {
    if (has(key)) fields[key] = trimString(body[key]);
  }

  if (has('description')) {
    const description = trimString(body.description);

    if (description.length > 500) {
      return { error: 'Description must be at most 500 characters' };
    }

    fields.description = description;
  }

  if (has('modelYear')) {
    const modelYear = parseNumber(body.modelYear);
    const maxYear = new Date().getFullYear() + 1;

    if (
      modelYear !== null &&
      (!Number.isInteger(modelYear) || modelYear < 1900 || modelYear > maxYear)
    ) {
      return { error: 'Invalid model year' };
    }

    fields.modelYear = modelYear;
  }

  if (has('images')) {
    if (!Array.isArray(body.images) || body.images.some((image) => typeof image !== 'string')) {
      return { error: 'Images must be a list of URLs' };
    }

    if (body.images.length > MAX_IMAGES) {
      return { error: `At most ${MAX_IMAGES} images are allowed` };
    }

    fields.images = body.images.map((image) => image.trim()).filter(Boolean);
  }

  if (has('enginePower') && body.enginePower !== null) {
    const value = parseNumber(body.enginePower?.value) ?? 0;
    const unit = body.enginePower?.unit || 'HP';

    if (!Number.isFinite(value) || value < 0) {
      return { error: 'Engine power must be a positive number' };
    }

    if (!ENGINE_POWER_UNITS.includes(unit)) {
      return { error: `Engine power unit must be one of: ${ENGINE_POWER_UNITS.join(', ')}` };
    }

    fields.enginePower = { value, unit };
  }

  for (const [key, options, label] of [
    ['fuelType', FUEL_TYPES, 'Fuel type'],
    ['driveType', DRIVE_TYPES, 'Drive type'],
    ['availability', AVAILABILITY_OPTIONS, 'Availability'],
  ]) {
    if (has(key)) {
      if (!options.includes(body[key])) {
        return { error: `${label} must be one of: ${options.join(', ')}` };
      }

      fields[key] = body[key];
    }
  }

  /* IMPLEMENTS */

  if (has('supportsImplements')) fields.supportsImplements = Boolean(body.supportsImplements);

  if (has('supportedImplements')) {
    if (
      !Array.isArray(body.supportedImplements) ||
      body.supportedImplements.some((item) => typeof item !== 'string')
    ) {
      return { error: 'Supported implements must be a list of names' };
    }

    fields.supportedImplements = [
      ...new Set(body.supportedImplements.map((item) => item.trim()).filter(Boolean)),
    ];
  }

  const supportsImplements = fields.supportsImplements ?? existing?.supportsImplements ?? false;

  if (!supportsImplements && (has('supportsImplements') || has('supportedImplements'))) {
    fields.supportedImplements = [];
  }

  /* AVAILABILITY WINDOW */

  for (const key of ['availableFrom', 'availableUntil']) {
    if (has(key)) {
      const date = parseDate(body[key]);
      if (isInvalidDate(date)) return { error: `Invalid ${key} date` };
      fields[key] = date;
    }
  }

  const availableFrom =
    fields.availableFrom !== undefined ? fields.availableFrom : existing?.availableFrom;
  const availableUntil =
    fields.availableUntil !== undefined ? fields.availableUntil : existing?.availableUntil;

  if (availableFrom && availableUntil && availableUntil < availableFrom) {
    return { error: 'Available until must be after available from' };
  }

  /* PRICING */

  if (isCreate || has('pricing')) {
    const existingPricing = existing?.pricing
      ? {
          hourly: existing.pricing.hourly,
          daily: existing.pricing.daily,
          custom: existing.pricing.custom.map((rate) => rate.toObject?.() ?? rate),
        }
      : null;

    const { pricing, error } = buildPricing(body.pricing, existingPricing);
    if (error) return { error };

    fields.pricing = pricing;
  }

  return { fields };
};

/*
 * Confirmed work that hasn't happened yet.
 */
const upcomingConfirmedFilter = (machineryId) => {
  const today = todayInIndia();

  return {
    machinery: machineryId,
    status: { $in: ['confirmed', 'accepted'] },
    $or: [{ endDate: { $gte: today } }, { endDate: null, bookingDate: { $gte: today } }],
  };
};

/*
|--------------------------------------------------------------------------
| GET MACHINERY META
|--------------------------------------------------------------------------
*/

export const getMachineryMeta = async (req, res) => {
  return res.status(200).json({
    success: true,
    categories: MACHINERY_CATEGORIES,
    implements: IMPLEMENTS,
    fuelTypes: FUEL_TYPES,
    driveTypes: DRIVE_TYPES,
    enginePowerUnits: ENGINE_POWER_UNITS,
    availabilityOptions: AVAILABILITY_OPTIONS,
    pricingTypes: PRICING_TYPES,
    customPriceUnits: CUSTOM_PRICE_UNITS,
    paymentMethods: PAYMENT_METHODS,
    maxBookingDays: MAX_BOOKING_DAYS,
    maxBookingHours: MAX_BOOKING_HOURS,
  });
};

/*
|--------------------------------------------------------------------------
| CREATE MACHINERY
|--------------------------------------------------------------------------
*/

export const createMachinery = async (req, res) => {
  try {
    const ownerId = getAuthenticatedUserId(req);

    const user = await User.findById(ownerId).select('fullName state district village');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    /*
     * Owner name and location default to the user's profile.
     */
    const body = { ...req.body };

    if (!trimString(body.ownerName)) body.ownerName = user.fullName || '';

    for (const key of ['state', 'district', 'village']) {
      if (body[key] === undefined || body[key] === '') body[key] = user[key] || '';
    }

    const { fields, error } = buildMachineryFields(body, { isCreate: true });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const machinery = await Machinery.create({
      ...fields,
      owner: ownerId,
      isActive: true,
    });

    await machinery.populate('owner', PUBLIC_OWNER_FIELDS);

    return res.status(201).json({
      success: true,
      message: 'Machinery added successfully',
      machinery,
    });
  } catch (error) {
    console.error('CREATE MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY MACHINERY
|--------------------------------------------------------------------------
*/

export const getMyMachinery = async (req, res) => {
  try {
    const ownerId = getAuthenticatedUserId(req);

    const machinery = await Machinery.find({ owner: ownerId })
      .populate('owner', PUBLIC_OWNER_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    /*
     * Number of requests waiting on the owner, per machine.
     */
    const pendingCounts = await MachineryBooking.aggregate([
      {
        $match: {
          machinery: { $in: machinery.map((item) => item._id) },
          status: 'pending',
          bookingDate: { $gte: todayInIndia() },
        },
      },
      { $group: { _id: '$machinery', count: { $sum: 1 } } },
    ]);

    const pendingByMachinery = new Map(
      pendingCounts.map((entry) => [String(entry._id), entry.count])
    );

    return res.status(200).json({
      success: true,
      count: machinery.length,
      machinery: machinery.map((item) => ({
        ...item,
        pendingRequests: pendingByMachinery.get(String(item._id)) || 0,
      })),
    });
  } catch (error) {
    console.error('GET MY MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL MACHINERY
|--------------------------------------------------------------------------
|
| GET /api/machinery
|
| Query params (all optional):
|   search          name, brand, model, category, implements
|   category, state, district, village
|   availability    available (default) | unavailable | busy | all
|   implement       supports this implement
|   fuelType, driveType
|   maxHourly, maxDaily
|   minRating
|   excludeMine     true -> hide the current user's machinery
|   sort            newest (default) | rating | hourly_asc | daily_asc
|   page, limit
|
*/

export const getAllMachinery = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    const {
      search,
      category,
      state,
      district,
      village,
      availability,
      implement,
      fuelType,
      driveType,
      maxHourly,
      maxDaily,
      minRating,
      excludeMine,
      sort,
    } = req.query;

    const filter = { isActive: true };

    if (availability !== 'all') {
      filter.availability = AVAILABILITY_OPTIONS.includes(availability)
        ? availability
        : 'available';
    }

    if (search && String(search).trim()) {
      const pattern = containsInsensitive(String(search));

      filter.$or = [
        { name: pattern },
        { brand: pattern },
        { model: pattern },
        { category: pattern },
        { supportedImplements: pattern },
      ];
    }

    if (category && String(category).trim()) filter.category = exactInsensitive(String(category));
    if (state && String(state).trim()) filter.state = exactInsensitive(String(state));
    if (district && String(district).trim()) filter.district = exactInsensitive(String(district));
    if (village && String(village).trim()) filter.village = exactInsensitive(String(village));

    if (implement && String(implement).trim()) {
      filter.supportedImplements = exactInsensitive(String(implement));
    }

    if (fuelType && FUEL_TYPES.includes(fuelType)) filter.fuelType = fuelType;
    if (driveType && DRIVE_TYPES.includes(driveType)) filter.driveType = driveType;

    const hourlyMax = parseNumber(maxHourly);
    const dailyMax = parseNumber(maxDaily);
    const ratingMin = parseNumber(minRating);

    if (Number.isFinite(hourlyMax)) filter['pricing.hourly'] = { $gt: 0, $lte: hourlyMax };
    if (Number.isFinite(dailyMax)) filter['pricing.daily'] = { $gt: 0, $lte: dailyMax };
    if (Number.isFinite(ratingMin)) filter.rating = { $gte: ratingMin };

    if (excludeMine === 'true') filter.owner = { $ne: userId };

    const sortOptions = {
      newest: { createdAt: -1 },
      rating: { rating: -1, totalJobsCompleted: -1, createdAt: -1 },
      hourly_asc: { 'pricing.hourly': 1, createdAt: -1 },
      daily_asc: { 'pricing.daily': 1, createdAt: -1 },
    };

    const currentPage = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const perPage = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const [machinery, total] = await Promise.all([
      Machinery.find(filter)
        .populate('owner', PUBLIC_OWNER_FIELDS)
        .sort(sortOptions[sort] || sortOptions.newest)
        .skip((currentPage - 1) * perPage)
        .limit(perPage)
        .lean(),
      Machinery.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / perPage);

    return res.status(200).json({
      success: true,
      count: machinery.length,
      total,
      pagination: {
        currentPage,
        limit: perPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
      machinery,
    });
  } catch (error) {
    console.error('GET ALL MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MACHINERY BY ID
|--------------------------------------------------------------------------
|
| Includes recent reviews, the dates/times it is already booked (so the
| app can grey them out) and the current user's open booking, if any.
| Inactive machinery is only visible to its owner.
|
*/

export const getMachineryById = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid machinery ID',
      });
    }

    const machinery = await Machinery.findById(id).populate('owner', PUBLIC_OWNER_FIELDS).lean();

    const isOwner = machinery && String(machinery.owner?._id) === String(userId);

    if (!machinery || (!machinery.isActive && !isOwner)) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found',
      });
    }

    const [reviews, bookedSlots, myActiveBooking] = await Promise.all([
      MachineryBooking.find({
        machinery: id,
        status: 'completed',
        'review.rating': { $ne: null },
      })
        .select('review workType farmer')
        .populate('farmer', 'fullName village district')
        .sort({ 'review.createdAt': -1 })
        .limit(10)
        .lean(),

      MachineryBooking.find(upcomingConfirmedFilter(id))
        .select('bookingDate endDate startTime endTime -_id')
        .sort({ bookingDate: 1 })
        .limit(50)
        .lean(),

      isOwner
        ? null
        : MachineryBooking.findOne({
            machinery: id,
            farmer: userId,
            status: { $in: ['pending', 'confirmed', 'accepted'] },
          })
            .select('_id status bookingDate endDate startTime pricingType totalAmount')
            .sort({ bookingDate: 1 })
            .lean(),
    ]);

    return res.status(200).json({
      success: true,
      machinery: {
        ...machinery,
        isOwner,
        bookedSlots,
        myActiveBooking: myActiveBooking || null,
        recentReviews: reviews.map((booking) => ({
          rating: booking.review.rating,
          comment: booking.review.comment,
          createdAt: booking.review.createdAt,
          workType: booking.workType,
          farmer: booking.farmer,
        })),
      },
    });
  } catch (error) {
    console.error('GET MACHINERY BY ID ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE MY MACHINERY
|--------------------------------------------------------------------------
|
| Price changes only apply to new bookings; existing bookings keep the
| price they were made with.
|
*/

export const updateMyMachinery = async (req, res) => {
  try {
    const ownerId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid machinery ID',
      });
    }

    const existing = await Machinery.findOne({ _id: id, owner: ownerId });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found or you are not the owner',
      });
    }

    const { fields, error } = buildMachineryFields(req.body, { isCreate: false, existing });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const machinery = await Machinery.findOneAndUpdate(
      { _id: id, owner: ownerId },
      { $set: fields },
      { returnDocument: 'after', runValidators: true }
    ).populate('owner', PUBLIC_OWNER_FIELDS);

    return res.status(200).json({
      success: true,
      message: 'Machinery updated successfully',
      machinery,
    });
  } catch (error) {
    console.error('UPDATE MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DEACTIVATE MACHINERY
|--------------------------------------------------------------------------
|
| Not allowed while confirmed work is still upcoming, so a farmer never
| loses a confirmed rental silently. Pending requests are cancelled.
|
*/

export const deactivateMachinery = async (req, res) => {
  try {
    const ownerId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid machinery ID',
      });
    }

    const existing = await Machinery.findOne({ _id: id, owner: ownerId }).select('_id');

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found',
      });
    }

    const upcoming = await MachineryBooking.countDocuments(upcomingConfirmedFilter(id));

    if (upcoming > 0) {
      return res.status(409).json({
        success: false,
        message: 'Complete or cancel the upcoming confirmed bookings before deactivating',
      });
    }

    const machinery = await Machinery.findOneAndUpdate(
      { _id: id, owner: ownerId },
      { $set: { isActive: false, availability: 'unavailable' } },
      { returnDocument: 'after' }
    );

    await MachineryBooking.updateMany(
      { machinery: id, status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          cancelledBy: 'system',
          cancelledAt: new Date(),
          cancellationReason: 'This machinery is no longer available for rent',
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Machinery deactivated successfully',
      machinery,
    });
  } catch (error) {
    console.error('DEACTIVATE MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to deactivate machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACTIVATE MACHINERY
|--------------------------------------------------------------------------
*/

export const activateMachinery = async (req, res) => {
  try {
    const ownerId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid machinery ID',
      });
    }

    const machinery = await Machinery.findOneAndUpdate(
      { _id: id, owner: ownerId },
      { $set: { isActive: true, availability: 'available' } },
      { returnDocument: 'after' }
    );

    if (!machinery) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Machinery activated successfully',
      machinery,
    });
  } catch (error) {
    console.error('ACTIVATE MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to activate machinery',
      error: error.message,
    });
  }
};
