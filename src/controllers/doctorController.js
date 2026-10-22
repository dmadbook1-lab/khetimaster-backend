import mongoose from 'mongoose';

import Doctor from '../models/Doctor.js';
import DoctorConsultation from '../models/DoctorConsultation.js';
import User from '../models/User.js';

import {
  DOCTOR_TYPES,
  CONSULTATION_TYPES,
  SPECIALIZATIONS,
  PROBLEM_TYPES,
  ANIMAL_TYPES,
  LANGUAGES,
  FEE_TYPES,
  AVAILABILITY_OPTIONS,
  PAYMENT_METHODS,
  DEFAULT_SLOT_MINUTES,
  MAX_IMAGES,
} from '../data/doctorOptions.js';

import { todayInIndia, addDays } from '../utils/indiaDate.js';

const DOCTOR_TYPE_KEYS = DOCTOR_TYPES.map((type) => type.key);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getAuthenticatedUserId = (req) => {
  const userId = req.user?.userId;
  return userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null;
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

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

/*
 * Accepts an array or a comma separated string. Trimmed, de-duplicated.
 */
const normalizeArray = (value) => {
  const list = Array.isArray(value)
    ? value.map((item) => String(item).trim())
    : typeof value === 'string'
      ? value.split(',').map((item) => item.trim())
      : [];

  return [...new Set(list.filter(Boolean))];
};

/*
 * Contact details are not shown in search results or public profiles.
 * They are shared through a consultation once the doctor accepts it.
 */
const toPublicDoctor = (doctor) => {
  const { phoneNumber, email, ...rest } = doctor;
  return rest;
};

const unauthorized = (res) =>
  res.status(401).json({
    success: false,
    message: 'Authentication required',
  });

/*
 * Validates doctor profile fields from the request body.
 *
 * On create the required fields must be present. On update only the
 * fields that were sent are validated and returned.
 *
 * Returns { fields } or { error }.
 */
const buildDoctorFields = (body, { isCreate, existing = null }) => {
  const fields = {};
  const has = (key) => body[key] !== undefined;

  if (isCreate || has('fullName')) {
    const fullName = trimString(body.fullName);

    if (!fullName) return { error: 'Full name is required' };
    if (fullName.length > 100) return { error: 'Full name must be at most 100 characters' };

    fields.fullName = fullName;
  }

  if (isCreate || has('doctorType')) {
    if (!DOCTOR_TYPE_KEYS.includes(body.doctorType)) {
      return { error: `Doctor type must be one of: ${DOCTOR_TYPE_KEYS.join(', ')}` };
    }

    fields.doctorType = body.doctorType;
  }

  if (has('phoneNumber')) {
    const phoneNumber = trimString(body.phoneNumber);

    if (phoneNumber && !/^\+?[0-9\s-]{10,15}$/.test(phoneNumber)) {
      return { error: 'Invalid phone number' };
    }

    fields.phoneNumber = phoneNumber;
  }

  if (has('email')) {
    const email = trimString(body.email).toLowerCase();

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: 'Invalid email address' };
    }

    fields.email = email;
  }

  for (const key of [
    'profileImage',
    'doctorateCertificate',
    'state',
    'district',
    'village',
    'address',
  ]) {
    if (has(key)) fields[key] = trimString(body[key]);
  }

  if (has('about')) {
    const about = trimString(body.about);

    if (about.length > 1000) return { error: 'About must be at most 1000 characters' };

    fields.about = about;
  }

  for (const key of ['specialization', 'qualification', 'languages']) {
    if (has(key)) {
      const list = normalizeArray(body[key]);

      if (list.length > 20) return { error: `${key} can have at most 20 entries` };

      fields[key] = list;
    }
  }

  /* FEE */

  if (has('consultationFee')) {
    const fee = parseNumber(body.consultationFee) ?? 0;

    if (!Number.isFinite(fee) || fee < 0) {
      return { error: 'Consultation fee must be a valid positive number' };
    }

    fields.consultationFee = Math.round(fee * 100) / 100;
  }

  if (has('consultationFeeType')) {
    if (!FEE_TYPES.includes(body.consultationFeeType)) {
      return { error: `Fee type must be one of: ${FEE_TYPES.join(', ')}` };
    }

    fields.consultationFeeType = body.consultationFeeType;
  }

  /*
   * Keep fee and fee type consistent: a free doctor charges 0, and a
   * fee of 0 means free.
   */
  if (has('consultationFee') || has('consultationFeeType') || isCreate) {
    const feeType =
      fields.consultationFeeType ?? existing?.consultationFeeType ?? 'perConsultation';
    const fee = fields.consultationFee ?? existing?.consultationFee ?? 0;

    if (feeType === 'free' || fee === 0) {
      fields.consultationFeeType = 'free';
      fields.consultationFee = 0;
    } else {
      fields.consultationFeeType = 'perConsultation';
      fields.consultationFee = fee;
    }
  }

  /* AVAILABILITY */

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

  if (has('profileCompleted')) fields.profileCompleted = Boolean(body.profileCompleted);

  return { fields };
};

/*
 * Accepted consultations that haven't happened yet.
 */
const upcomingAcceptedFilter = (doctorId) => ({
  doctor: doctorId,
  status: { $in: ['accepted', 'confirmed'] },
  consultationDate: { $gte: todayInIndia() },
});

/*
|--------------------------------------------------------------------------
| GET DOCTOR META
|--------------------------------------------------------------------------
| GET /api/doctors/meta
|--------------------------------------------------------------------------
*/

export const getDoctorMeta = async (req, res) => {
  return res.status(200).json({
    success: true,
    doctorTypes: DOCTOR_TYPES,
    consultationTypes: CONSULTATION_TYPES,
    specializations: SPECIALIZATIONS,
    problemTypes: PROBLEM_TYPES,
    animalTypes: ANIMAL_TYPES,
    languages: LANGUAGES,
    feeTypes: FEE_TYPES,
    availabilityOptions: AVAILABILITY_OPTIONS,
    paymentMethods: PAYMENT_METHODS,
    defaultSlotMinutes: DEFAULT_SLOT_MINUTES,
    maxImages: MAX_IMAGES,
  });
};

/*
|--------------------------------------------------------------------------
| CREATE DOCTOR
|--------------------------------------------------------------------------
| POST /api/doctors
|
| Name, phone, email and location default to the user's profile.
|--------------------------------------------------------------------------
*/

export const createDoctor = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const existingDoctor = await Doctor.findOne({ user: userId });

    if (existingDoctor) {
      return res.status(409).json({
        success: false,
        message: 'You already have a doctor profile',
        doctor: existingDoctor,
      });
    }

    const user = await User.findById(userId).select(
      'fullName phoneNumber email state district village'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const body = { ...req.body };

    for (const key of ['fullName', 'phoneNumber', 'email', 'state', 'district', 'village']) {
      if (body[key] === undefined || body[key] === '') body[key] = user[key] || '';
    }

    const { fields, error } = buildDoctorFields(body, { isCreate: true });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const doctor = await Doctor.create({
      profileCompleted: true,
      ...fields,
      user: userId,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Doctor profile created successfully',
      doctor,
    });
  } catch (error) {
    console.error('createDoctor error:', error);

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You already have a doctor profile',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create doctor profile',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL ACTIVE DOCTORS
|--------------------------------------------------------------------------
| GET /api/doctors
|
| Query params (all optional):
|   search          name, specialization, qualification, about
|   doctorType      veterinarian | agriculturalDoctor
|   specialization, language, state, district
|   availability    available (default) | unavailable | busy | all
|   minFee, maxFee, freeOnly=true
|   minRating
|   sort            rating (default) | fee_asc | experience | newest
|   page, limit
|--------------------------------------------------------------------------
*/

export const getAllDoctors = async (req, res) => {
  try {
    const {
      search,
      doctorType,
      specialization,
      language,
      state,
      district,
      availability,
      minFee,
      maxFee,
      freeOnly,
      minRating,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    const currentUserId = getAuthenticatedUserId(req);

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const query = { isActive: true };

    if (currentUserId) {
      query.user = { $ne: new mongoose.Types.ObjectId(currentUserId) };
    }

    if (availability !== 'all') {
      query.availability = AVAILABILITY_OPTIONS.includes(availability) ? availability : 'available';
    }

    if (doctorType && DOCTOR_TYPE_KEYS.includes(doctorType)) query.doctorType = doctorType;

    if (specialization && String(specialization).trim()) {
      query.specialization = containsInsensitive(String(specialization));
    }

    if (language && String(language).trim()) {
      query.languages = exactInsensitive(String(language));
    }

    if (state && String(state).trim()) query.state = exactInsensitive(String(state));
    if (district && String(district).trim()) query.district = exactInsensitive(String(district));

    if (search && String(search).trim()) {
      const pattern = containsInsensitive(String(search));

      query.$or = [
        { fullName: pattern },
        { specialization: pattern },
        { qualification: pattern },
        { about: pattern },
      ];
    }

    if (freeOnly === 'true') {
      query.consultationFee = 0;
    } else {
      const min = parseNumber(minFee);
      const max = parseNumber(maxFee);

      if (Number.isFinite(min) || Number.isFinite(max)) {
        query.consultationFee = {};
        if (Number.isFinite(min)) query.consultationFee.$gte = min;
        if (Number.isFinite(max)) query.consultationFee.$lte = max;
      }
    }

    const ratingMin = parseNumber(minRating);
    if (Number.isFinite(ratingMin)) query.rating = { $gte: ratingMin };

    const sortOptions = {
      rating: { rating: -1, totalReviews: -1, totalConsultations: -1, createdAt: -1 },
      fee_asc: { consultationFee: 1, rating: -1 },
      experience: { totalConsultations: -1, rating: -1 },
      newest: { createdAt: -1 },
    };

    const [doctors, total] = await Promise.all([
      Doctor.find(query)
        .sort(sortOptions[sort] || sortOptions.rating)
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(),

      Doctor.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      doctors: doctors.map(toPublicDoctor),
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error('getAllDoctors error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY DOCTOR PROFILE
|--------------------------------------------------------------------------
| GET /api/doctors/me
|--------------------------------------------------------------------------
*/

export const getMyDoctorProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const doctor = await Doctor.findOne({ user: userId }).lean();

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found',
      });
    }

    const [pendingRequests, upcomingConsultations] = await Promise.all([
      DoctorConsultation.countDocuments({
        doctor: doctor._id,
        status: 'pending',
        consultationDate: { $gte: todayInIndia() },
      }),
      DoctorConsultation.countDocuments(upcomingAcceptedFilter(doctor._id)),
    ]);

    return res.status(200).json({
      success: true,
      doctor: { ...doctor, pendingRequests, upcomingConsultations },
    });
  } catch (error) {
    console.error('getMyDoctorProfile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor profile',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET DOCTOR BY ID
|--------------------------------------------------------------------------
| GET /api/doctors/:id
|
| Public profile with recent reviews, the times already booked in the
| next 14 days (so the app can grey them out) and the current user's
| open consultation with this doctor, if any.
|--------------------------------------------------------------------------
*/

export const getDoctorById = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor id',
      });
    }

    const doctor = await Doctor.findOne({ _id: id, isActive: true }).lean();

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found',
      });
    }

    const isOwner = String(doctor.user) === String(userId);
    const today = todayInIndia();

    const [reviews, bookedSlots, myActiveConsultation] = await Promise.all([
      DoctorConsultation.find({
        doctor: id,
        status: 'completed',
        'review.rating': { $ne: null },
      })
        .select('review consultationType problemType farmer')
        .populate('farmer', 'fullName village district')
        .sort({ 'review.createdAt': -1 })
        .limit(10)
        .lean(),

      DoctorConsultation.find({
        doctor: id,
        status: { $in: ['accepted', 'confirmed'] },
        consultationDate: { $gte: today, $lte: addDays(today, 14) },
      })
        .select('consultationDate startTime endTime -_id')
        .sort({ consultationDate: 1, startMinute: 1 })
        .lean(),

      isOwner || !userId
        ? null
        : DoctorConsultation.findOne({
            doctor: id,
            farmer: userId,
            status: { $in: ['pending', 'accepted', 'confirmed'] },
          })
            .select('_id status consultationDate startTime')
            .sort({ consultationDate: 1 })
            .lean(),
    ]);

    return res.status(200).json({
      success: true,
      doctor: {
        ...(isOwner ? doctor : toPublicDoctor(doctor)),
        isOwner,
        bookedSlots,
        myActiveConsultation: myActiveConsultation || null,
        recentReviews: reviews.map((consultation) => ({
          rating: consultation.review.rating,
          comment: consultation.review.comment,
          createdAt: consultation.review.createdAt,
          problemType: consultation.problemType,
          farmer: consultation.farmer,
        })),
      },
    });
  } catch (error) {
    console.error('getDoctorById error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor',
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE MY DOCTOR PROFILE
|--------------------------------------------------------------------------
| PUT /api/doctors/me
|
| Fee changes only apply to new consultations.
|--------------------------------------------------------------------------
*/

export const updateMyDoctorProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const existing = await Doctor.findOne({ user: userId });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found',
      });
    }

    const { fields, error } = buildDoctorFields(req.body, { isCreate: false, existing });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const doctor = await Doctor.findOneAndUpdate(
      { user: userId },
      { $set: fields },
      { returnDocument: 'after', runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Doctor profile updated successfully',
      doctor,
    });
  } catch (error) {
    console.error('updateMyDoctorProfile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update doctor profile',
    });
  }
};

/*
|--------------------------------------------------------------------------
| DEACTIVATE
|--------------------------------------------------------------------------
| PATCH /api/doctors/me/deactivate
|
| Not allowed while accepted consultations are still upcoming. Pending
| requests are cancelled.
|--------------------------------------------------------------------------
*/

export const deactivateMyDoctorProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const existing = await Doctor.findOne({ user: userId }).select('_id');

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found',
      });
    }

    const upcoming = await DoctorConsultation.countDocuments(upcomingAcceptedFilter(existing._id));

    if (upcoming > 0) {
      return res.status(409).json({
        success: false,
        message: 'Complete or cancel your upcoming accepted consultations before deactivating',
      });
    }

    const doctor = await Doctor.findOneAndUpdate(
      { user: userId },
      { $set: { isActive: false, availability: 'unavailable' } },
      { returnDocument: 'after' }
    );

    await DoctorConsultation.updateMany(
      { doctor: existing._id, status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          cancelledBy: 'system',
          cancelledAt: new Date(),
          cancellationReason: 'The doctor is no longer taking consultations',
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Doctor profile deactivated successfully',
      doctor,
    });
  } catch (error) {
    console.error('deactivateMyDoctorProfile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to deactivate doctor profile',
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACTIVATE
|--------------------------------------------------------------------------
| PATCH /api/doctors/me/activate
|--------------------------------------------------------------------------
*/

export const activateMyDoctorProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const doctor = await Doctor.findOneAndUpdate(
      { user: userId },
      { $set: { isActive: true, availability: 'available' } },
      { returnDocument: 'after' }
    );

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Doctor profile activated successfully',
      doctor,
    });
  } catch (error) {
    console.error('activateMyDoctorProfile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to activate doctor profile',
    });
  }
};
