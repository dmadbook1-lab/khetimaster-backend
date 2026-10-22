import mongoose from 'mongoose';

import Labourer from '../models/Labourer.js';
import LabourBooking from '../models/LabourBooking.js';
import User from '../models/User.js';

import {
  LABOUR_TYPES,
  WORK_TYPES,
  LANGUAGES,
  GENDERS,
  WAGE_TYPES,
  EXPERIENCE_UNITS,
  AVAILABILITY_OPTIONS,
  MAX_BOOKING_DAYS,
} from '../data/labourOptions.js';

import { todayInIndia } from '../utils/indiaDate.js';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const isValidObjectId = (id) => {
  return id && mongoose.Types.ObjectId.isValid(id);
};

const getAuthenticatedUserId = (req) => {
  return req.user?.userId;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactInsensitive = (value) => new RegExp(`^${escapeRegex(value.trim())}$`, 'i');

const containsInsensitive = (value) => new RegExp(escapeRegex(value.trim()), 'i');

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

/*
 * undefined / null / '' -> null, anything else -> Number (may be NaN)
 */
const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const parseDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return new Date(value);
};

const isInvalidDate = (date) => date instanceof Date && Number.isNaN(date.getTime());

/*
 * Trimmed, de-duplicated list of non-empty strings, or an error message.
 */
const parseStringList = (value, label, max = 20) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return { error: `${label} must be a list of text values` };
  }

  const list = [...new Set(value.map((item) => item.trim()).filter(Boolean))];

  if (list.length > max) {
    return { error: `${label} can have at most ${max} entries` };
  }

  return { list };
};

/*
 * Phone numbers are not shown in search results or public profiles.
 * They are shared through a booking once the labourer accepts it.
 */
const toPublicLabourer = (labourer) => {
  const { phoneNumber, ...rest } = labourer;
  return rest;
};

/*
 * Validates labourer profile fields from the request body.
 *
 * On create the required fields must be present. On update only the
 * fields that were sent are validated and returned.
 *
 * Returns { fields } or { error }.
 */
const buildLabourerFields = (body, { isCreate, existing = null }) => {
  const fields = {};
  const has = (key) => body[key] !== undefined;

  if (isCreate || has('fullName')) {
    const fullName = trimString(body.fullName);

    if (!fullName) return { error: 'Full name is required' };
    if (fullName.length > 100) return { error: 'Full name must be at most 100 characters' };

    fields.fullName = fullName;
  }

  if (has('phoneNumber')) {
    const phoneNumber = trimString(body.phoneNumber);

    if (phoneNumber && !/^\+?[0-9\s-]{10,15}$/.test(phoneNumber)) {
      return { error: 'Invalid phone number' };
    }

    fields.phoneNumber = phoneNumber;
  }

  if (has('profileImage')) fields.profileImage = trimString(body.profileImage);

  if (has('gender')) {
    if (!GENDERS.includes(body.gender)) {
      return { error: `Gender must be one of: ${GENDERS.join(', ')}` };
    }

    fields.gender = body.gender;
  }

  if (has('age')) {
    const age = parseNumber(body.age);

    if (age !== null && (!Number.isInteger(age) || age < 18 || age > 100)) {
      return { error: 'Age must be a whole number between 18 and 100' };
    }

    fields.age = age;
  }

  if (isCreate || has('labourType')) {
    const labourType = trimString(body.labourType);

    if (!labourType) return { error: 'Labour type is required' };
    if (labourType.length > 100) return { error: 'Labour type must be at most 100 characters' };

    fields.labourType = labourType;
  }

  for (const [key, label] of [
    ['skills', 'Skills'],
    ['languages', 'Languages'],
    ['preferredWork', 'Preferred work'],
  ]) {
    if (has(key)) {
      const { list, error } = parseStringList(body[key], label);
      if (error) return { error };
      fields[key] = list;
    }
  }

  if (has('experience')) {
    const experience = parseNumber(body.experience) ?? 0;

    if (!Number.isFinite(experience) || experience < 0 || experience > 80) {
      return { error: 'Experience must be a number between 0 and 80' };
    }

    fields.experience = experience;
  }

  if (has('experienceUnit')) {
    if (!EXPERIENCE_UNITS.includes(body.experienceUnit)) {
      return { error: `Experience unit must be one of: ${EXPERIENCE_UNITS.join(', ')}` };
    }

    fields.experienceUnit = body.experienceUnit;
  }

  if (has('expectedWage')) {
    const expectedWage = parseNumber(body.expectedWage) ?? 0;

    if (!Number.isFinite(expectedWage) || expectedWage < 0) {
      return { error: 'Expected wage must be a positive number' };
    }

    fields.expectedWage = Math.round(expectedWage * 100) / 100;
  }

  if (has('wageType')) {
    if (!WAGE_TYPES.includes(body.wageType)) {
      return { error: `Wage type must be one of: ${WAGE_TYPES.join(', ')}` };
    }

    fields.wageType = body.wageType;
  }

  if (has('availability')) {
    if (!AVAILABILITY_OPTIONS.includes(body.availability)) {
      return { error: `Availability must be one of: ${AVAILABILITY_OPTIONS.join(', ')}` };
    }

    fields.availability = body.availability;
  }

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

  for (const key of ['state', 'district', 'taluka', 'village']) {
    if (has(key)) fields[key] = trimString(body[key]);
  }

  if (has('profileCompleted')) fields.profileCompleted = Boolean(body.profileCompleted);

  return { fields };
};

/*
 * Bookings that block a labourer from going inactive: accepted work
 * that hasn't finished yet.
 */
const upcomingAcceptedFilter = (labourerId) => {
  const today = todayInIndia();

  return {
    labourer: labourerId,
    status: { $in: ['accepted', 'confirmed'] },
    $or: [{ endDate: { $gte: today } }, { endDate: null, bookingDate: { $gte: today } }],
  };
};

/*
|--------------------------------------------------------------------------
| GET LABOUR META
|--------------------------------------------------------------------------
|
| Options for the labour profile / booking forms and filters.
|
*/

export const getLabourMeta = async (req, res) => {
  return res.status(200).json({
    success: true,
    labourTypes: LABOUR_TYPES,
    workTypes: WORK_TYPES,
    languages: LANGUAGES,
    genders: GENDERS,
    wageTypes: WAGE_TYPES,
    experienceUnits: EXPERIENCE_UNITS,
    availabilityOptions: AVAILABILITY_OPTIONS,
    maxBookingDays: MAX_BOOKING_DAYS,
  });
};

/*
|--------------------------------------------------------------------------
| CREATE LABOURER
|--------------------------------------------------------------------------
*/

export const createLabourer = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId || !isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const existingLabourer = await Labourer.findOne({ user: userId });

    if (existingLabourer) {
      return res.status(409).json({
        success: false,
        message: 'Labourer profile already exists',
        labourer: existingLabourer,
      });
    }

    const user = await User.findById(userId).select(
      'fullName phoneNumber state district taluka village'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    /*
     * Name, phone and location default to the user's profile.
     */
    const body = { ...req.body };

    for (const key of ['fullName', 'phoneNumber', 'state', 'district', 'taluka', 'village']) {
      if (body[key] === undefined || body[key] === '') body[key] = user[key] || '';
    }

    const { fields, error } = buildLabourerFields(body, { isCreate: true });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const labourer = await Labourer.create({
      ...fields,
      user: userId,
      profileCompleted: true,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Labourer profile created successfully',
      labourer,
    });
  } catch (error) {
    console.error('Create labourer error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Labourer profile already exists for this user',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create labourer profile',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL LABOURERS
|--------------------------------------------------------------------------
|
| GET /api/labourers
|
| Query params (all optional):
|   search          name, labour type, skills, preferred work
|   labourType, skill, state, district, taluka, village, gender
|   availability    available (default) | unavailable | busy | all
|   minWage, maxWage, wageType
|   minExperience, maxExperience
|   minRating
|   sort            rating (default) | wage_asc | wage_desc | experience | newest
|   page, limit
|
*/

export const getAllLabourers = async (req, res) => {
  try {
    const currentUserId = getAuthenticatedUserId(req);

    const {
      search,
      labourType,
      skill,
      state,
      district,
      taluka,
      village,
      availability,
      wageType,
      minWage,
      maxWage,
      minExperience,
      maxExperience,
      minRating,
      gender,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    const filters = { isActive: true };

    if (currentUserId && isValidObjectId(currentUserId)) {
      filters.user = { $ne: new mongoose.Types.ObjectId(currentUserId) };
    }

    if (availability !== 'all') {
      filters.availability = AVAILABILITY_OPTIONS.includes(availability)
        ? availability
        : 'available';
    }

    if (search && String(search).trim()) {
      const pattern = containsInsensitive(String(search));

      filters.$or = [
        { fullName: pattern },
        { labourType: pattern },
        { skills: pattern },
        { preferredWork: pattern },
      ];
    }

    if (labourType && String(labourType).trim()) {
      filters.labourType = exactInsensitive(String(labourType));
    }

    if (skill && String(skill).trim()) filters.skills = containsInsensitive(String(skill));
    if (state && String(state).trim()) filters.state = exactInsensitive(String(state));
    if (district && String(district).trim()) filters.district = exactInsensitive(String(district));
    if (taluka && String(taluka).trim()) filters.taluka = exactInsensitive(String(taluka));
    if (village && String(village).trim()) filters.village = exactInsensitive(String(village));

    if (gender && GENDERS.includes(gender)) filters.gender = gender;
    if (wageType && WAGE_TYPES.includes(wageType)) filters.wageType = wageType;

    const addRange = (field, min, max) => {
      const low = parseNumber(min);
      const high = parseNumber(max);

      if (Number.isFinite(low) || Number.isFinite(high)) {
        filters[field] = {};
        if (Number.isFinite(low)) filters[field].$gte = low;
        if (Number.isFinite(high)) filters[field].$lte = high;
      }
    };

    addRange('expectedWage', minWage, maxWage);
    addRange('experience', minExperience, maxExperience);
    addRange('rating', minRating, undefined);

    const sortOptions = {
      rating: { rating: -1, totalJobsCompleted: -1, createdAt: -1 },
      wage_asc: { expectedWage: 1, rating: -1 },
      wage_desc: { expectedWage: -1, rating: -1 },
      experience: { experience: -1, rating: -1 },
      newest: { createdAt: -1 },
    };

    const currentPage = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (currentPage - 1) * perPage;

    const [labourers, total] = await Promise.all([
      Labourer.find(filters)
        .sort(sortOptions[sort] || sortOptions.rating)
        .skip(skip)
        .limit(perPage)
        .lean(),

      Labourer.countDocuments(filters),
    ]);

    const totalPages = Math.ceil(total / perPage);

    return res.status(200).json({
      success: true,
      message: 'Labourers fetched successfully',
      count: labourers.length,
      total,
      pagination: {
        currentPage,
        limit: perPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
      labourers: labourers.map(toPublicLabourer),
    });
  } catch (error) {
    console.error('Get all labourers error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch labourers',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY LABOURER PROFILE
|--------------------------------------------------------------------------
*/

export const getMyLabourerProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const labourer = await Labourer.findOne({ user: userId }).lean();

    if (!labourer) {
      return res.status(404).json({
        success: false,
        message: 'Labourer profile not found',
      });
    }

    const pendingRequests = await LabourBooking.countDocuments({
      labourer: labourer._id,
      status: 'pending',
    });

    return res.status(200).json({
      success: true,
      labourer: { ...labourer, pendingRequests },
    });
  } catch (error) {
    console.error('Get my labourer profile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch labourer profile',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET LABOURER BY ID
|--------------------------------------------------------------------------
|
| Public profile with recent reviews. For a farmer, also returns their
| open booking with this labourer (if any).
|
*/

export const getLabourerById = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid labourer ID',
      });
    }

    const labourer = await Labourer.findOne({ _id: id, isActive: true }).lean();

    if (!labourer) {
      return res.status(404).json({
        success: false,
        message: 'Labourer not found',
      });
    }

    const isOwner = String(labourer.user) === String(userId);

    const [reviews, myActiveBooking] = await Promise.all([
      LabourBooking.find({
        labourer: id,
        status: 'completed',
        'review.rating': { $ne: null },
      })
        .select('review workType farmer')
        .populate('farmer', 'fullName village district')
        .sort({ 'review.createdAt': -1 })
        .limit(10)
        .lean(),

      isOwner
        ? null
        : LabourBooking.findOne({
            labourer: id,
            farmer: userId,
            status: { $in: ['pending', 'accepted', 'confirmed'] },
          })
            .select('_id status bookingDate numberOfDays workType')
            .sort({ bookingDate: 1 })
            .lean(),
    ]);

    return res.status(200).json({
      success: true,
      labourer: {
        ...(isOwner ? labourer : toPublicLabourer(labourer)),
        isOwner,
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
    console.error('Get labourer by ID error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch labourer',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE MY LABOURER PROFILE
|--------------------------------------------------------------------------
*/

export const updateMyLabourerProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const existing = await Labourer.findOne({ user: userId });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Labourer profile not found',
      });
    }

    const { fields, error } = buildLabourerFields(req.body, { isCreate: false, existing });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const labourer = await Labourer.findOneAndUpdate(
      { user: userId },
      { $set: fields },
      { returnDocument: 'after', runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Labourer profile updated successfully',
      labourer,
    });
  } catch (error) {
    console.error('Update labourer profile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update labourer profile',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DEACTIVATE MY LABOURER PROFILE
|--------------------------------------------------------------------------
|
| Not allowed while accepted work is still upcoming, so a farmer never
| loses a confirmed labourer silently. Pending requests are cancelled.
|
*/

export const deactivateMyLabourerProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const existing = await Labourer.findOne({ user: userId }).select('_id');

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Labourer profile not found',
      });
    }

    const upcoming = await LabourBooking.countDocuments(upcomingAcceptedFilter(existing._id));

    if (upcoming > 0) {
      return res.status(409).json({
        success: false,
        message: 'Complete or cancel your upcoming accepted bookings before deactivating',
      });
    }

    const labourer = await Labourer.findOneAndUpdate(
      { user: userId },
      { $set: { isActive: false, availability: 'unavailable' } },
      { returnDocument: 'after' }
    );

    await LabourBooking.updateMany(
      { labourer: existing._id, status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          cancelledBy: 'system',
          cancelledAt: new Date(),
          cancellationReason: 'Labourer is no longer taking work',
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Labourer profile deactivated successfully',
      labourer,
    });
  } catch (error) {
    console.error('Deactivate labourer error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to deactivate labourer profile',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACTIVATE MY LABOURER PROFILE
|--------------------------------------------------------------------------
*/

export const activateMyLabourerProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const labourer = await Labourer.findOneAndUpdate(
      { user: userId },
      { $set: { isActive: true, availability: 'available' } },
      { returnDocument: 'after' }
    );

    if (!labourer) {
      return res.status(404).json({
        success: false,
        message: 'Labourer profile not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Labourer profile activated successfully',
      labourer,
    });
  } catch (error) {
    console.error('Activate labourer error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to activate labourer profile',
      error: error.message,
    });
  }
};
