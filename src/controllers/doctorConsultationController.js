import mongoose from 'mongoose';

import DoctorConsultation from '../models/DoctorConsultation.js';
import Doctor from '../models/Doctor.js';
import User from '../models/User.js';

import {
  DOCTOR_TYPES,
  PAYMENT_METHODS,
  DEFAULT_SLOT_MINUTES,
  MAX_IMAGES,
} from '../data/doctorOptions.js';
import { toIndianDay, todayInIndia, nowMinutesInIndia } from '../utils/indiaDate.js';
import { parseTime, MINUTES_PER_DAY } from '../utils/timeOfDay.js';

const DOCTOR_FIELDS =
  'user fullName profileImage phoneNumber doctorType specialization qualification languages about consultationFee consultationFeeType state district village address rating totalReviews totalConsultations';

const FARMER_FIELDS = 'fullName phoneNumber state district village';

const ACCEPTED_STATUSES = ['accepted', 'confirmed'];

const ACTIVE_STATUSES = ['pending', ...ACCEPTED_STATUSES];

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getAuthenticatedUserId = (req) => {
  const userId = req.user?.userId;
  return userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null;
};

const isValidObjectId = (id) => id && mongoose.Types.ObjectId.isValid(id);

const trimText = (value, max = 500) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const unauthorized = (res) =>
  res.status(401).json({
    success: false,
    message: 'Authenticated user not found',
  });

/*
 * The minutes of the day a consultation blocks the doctor. Older
 * consultations without minutes use their start time and the default
 * slot length.
 */
const timeWindow = (consultation) => {
  const start = consultation.startMinute ?? parseTime(consultation.startTime) ?? 0;
  const end = consultation.endMinute ?? Math.min(start + DEFAULT_SLOT_MINUTES, MINUTES_PER_DAY);

  return [start, end];
};

const windowsOverlap = ([startA, endA], [startB, endB]) => startA < endB && startB < endA;

/*
 * The doctor's consultations on a day whose times overlap the window.
 */
const findOverlapping = async ({ doctor, date, window, statuses, excludeId }) => {
  const candidates = await DoctorConsultation.find({
    doctor,
    consultationDate: date,
    status: { $in: statuses },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).lean();

  return candidates.filter((consultation) => windowsOverlap(timeWindow(consultation), window));
};

/*
 * Pending requests whose date has passed can no longer happen.
 */
const expireStaleRequests = () =>
  DoctorConsultation.updateMany(
    { status: 'pending', consultationDate: { $lt: todayInIndia() } },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'system',
        cancelledAt: new Date(),
        cancellationReason: 'Request expired: the doctor did not respond before the date',
      },
    }
  );

const getRole = (consultation, userId) => {
  const farmerId = String(consultation.farmer?._id || consultation.farmer);
  const doctorUserId = String(consultation.doctor?.user || '');

  if (farmerId === String(userId)) return 'farmer';
  if (doctorUserId && doctorUserId === String(userId)) return 'doctor';
  return null;
};

/*
 * Phone numbers are only shared once the doctor has accepted. Emails
 * are never shared.
 */
const formatConsultation = (consultation, userId) => {
  const plain =
    typeof consultation.toObject === 'function' ? consultation.toObject() : consultation;
  const shareContact = [...ACCEPTED_STATUSES, 'completed'].includes(plain.status);

  const hideContact = (party) => {
    if (!party || typeof party !== 'object') return party;

    const { phoneNumber, email, ...rest } = party;
    return shareContact ? { ...rest, phoneNumber } : rest;
  };

  const myRole = getRole(plain, userId);

  return {
    ...plain,
    farmer: hideContact(plain.farmer),
    doctor: hideContact(plain.doctor),
    myRole,
    canReview: myRole === 'farmer' && plain.status === 'completed' && !plain.review?.rating,
  };
};

const populateConsultation = (query) =>
  query.populate('doctor', DOCTOR_FIELDS).populate('farmer', FARMER_FIELDS);

const respondWithConsultation = async (res, consultationId, userId, status, message) => {
  const consultation = await populateConsultation(
    DoctorConsultation.findById(consultationId)
  ).lean();

  return res.status(status).json({
    success: true,
    message,
    consultation: formatConsultation(consultation, userId),
  });
};

/*
 * Loads a consultation the current user is part of. Sends the error
 * response itself and returns null when it can't be used.
 */
const loadConsultationForUser = async (req, res) => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    unauthorized(res);
    return null;
  }

  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400).json({ success: false, message: 'Invalid consultation ID' });
    return null;
  }

  const consultation = await DoctorConsultation.findById(id).populate('doctor', 'user');

  if (!consultation) {
    res.status(404).json({ success: false, message: 'Consultation not found' });
    return null;
  }

  const role = getRole(consultation, userId);

  if (!role) {
    res.status(403).json({
      success: false,
      message: 'You are not part of this consultation',
    });
    return null;
  }

  return { consultation, role, userId };
};

const staleResponse = (res) =>
  res.status(409).json({
    success: false,
    message: 'This consultation was just updated. Please refresh and try again.',
  });

/*
 * Keep the doctor's rating in sync with their reviews.
 */
const refreshDoctorRating = async (doctorId) => {
  const [stats] = await DoctorConsultation.aggregate([
    {
      $match: {
        doctor: new mongoose.Types.ObjectId(String(doctorId)),
        status: 'completed',
        'review.rating': { $ne: null },
      },
    },
    { $group: { _id: null, average: { $avg: '$review.rating' }, count: { $sum: 1 } } },
  ]);

  await Doctor.updateOne(
    { _id: doctorId },
    {
      $set: {
        rating: stats ? Math.round(stats.average * 10) / 10 : 0,
        totalReviews: stats ? stats.count : 0,
      },
    }
  );
};

/*
 * Doctor's outcome fields from the request body.
 */
const buildOutcome = (body) => {
  const update = {};

  for (const key of ['doctorNotes', 'diagnosis', 'prescription']) {
    if (body?.[key] !== undefined) update[key] = trimText(body[key], 2000);
  }

  if (body?.followUpDate !== undefined) {
    const followUpDate = body.followUpDate ? toIndianDay(body.followUpDate) : null;

    if (followUpDate && Number.isNaN(followUpDate.getTime())) {
      return { error: 'Invalid follow-up date' };
    }

    update.followUpDate = followUpDate;
  }

  return { update };
};

const paginate = (query) => {
  const currentPage = Math.max(Number(query.page) || 1, 1);
  const perPage = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  return { currentPage, perPage, skip: (currentPage - 1) * perPage };
};

const paginationInfo = (currentPage, perPage, total) => {
  const totalPages = Math.ceil(total / perPage);

  return {
    currentPage,
    limit: perPage,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
};

/*
 * status query param -> filter value.
 *   active   -> pending + accepted
 *   accepted -> accepted (incl. old 'confirmed')
 *   all      -> no filter
 */
const statusFilter = (status) => {
  if (!status || status === 'all') return undefined;
  if (status === 'active') return { $in: ACTIVE_STATUSES };
  if (status === 'accepted' || status === 'confirmed') return { $in: ACCEPTED_STATUSES };
  return status;
};

const listConsultations = async (req, res, filters, userId, message) => {
  await expireStaleRequests();

  const status = statusFilter(req.query.status);
  if (status) filters.status = status;

  const { currentPage, perPage, skip } = paginate(req.query);

  const [consultations, total] = await Promise.all([
    populateConsultation(DoctorConsultation.find(filters))
      .sort({ consultationDate: -1, startMinute: 1, createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .lean(),

    DoctorConsultation.countDocuments(filters),
  ]);

  return res.status(200).json({
    success: true,
    message,
    count: consultations.length,
    total,
    pagination: paginationInfo(currentPage, perPage, total),
    consultations: consultations.map((consultation) => formatConsultation(consultation, userId)),
  });
};

/*
|--------------------------------------------------------------------------
| CREATE CONSULTATION (FARMER)
|--------------------------------------------------------------------------
| POST /api/doctor-consultations
|
| {
|   "doctorId": "...",
|   "consultationDate": "2026-10-25",
|   "startTime": "10:00",              // "10:00" or "10:00 AM"
|   "endTime": "10:30",                // optional, default 30 min slot
|   "consultationType": "veterinary",  // optional, follows the doctor's type
|   "problemType", "symptoms", "description",
|   "animalType", "animalCount", "animalAge",   // veterinary
|   "cropName",                                 // agricultural
|   "images": ["https://..."],         // photos of the problem, max 5
|   "state", "district", "village", "address",  // default to farmer's profile
|   "paymentMethod": "cod",
|   "farmerNotes": "..."
| }
|
| The fee comes from the doctor's profile, never from the app.
|--------------------------------------------------------------------------
*/

export const createDoctorConsultation = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);
    if (!farmerId) return unauthorized(res);

    const body = req.body || {};

    if (!isValidObjectId(body.doctorId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid doctor ID is required',
      });
    }

    /* DATE / TIME */

    const date = toIndianDay(body.consultationDate);

    if (!date || Number.isNaN(date.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'A valid consultation date is required',
      });
    }

    const today = todayInIndia();

    if (date < today) {
      return res.status(400).json({
        success: false,
        message: 'Consultation date cannot be in the past',
      });
    }

    const startMinute = body.startTime ? parseTime(body.startTime) : null;

    if (startMinute === null) {
      return res.status(400).json({
        success: false,
        message: 'A valid start time is required (e.g. 10:00 or 10:00 AM)',
      });
    }

    if (date.getTime() === today.getTime() && startMinute < nowMinutesInIndia()) {
      return res.status(400).json({
        success: false,
        message: 'This time has already passed today',
      });
    }

    let endMinute = Math.min(startMinute + DEFAULT_SLOT_MINUTES, MINUTES_PER_DAY);

    if (body.endTime) {
      endMinute = parseTime(body.endTime);

      if (endMinute === null) {
        return res.status(400).json({ success: false, message: 'Invalid end time' });
      }

      if (endMinute <= startMinute) {
        return res.status(400).json({
          success: false,
          message: 'End time must be after start time',
        });
      }
    }

    /* DETAILS */

    const animalCount = parseNumber(body.animalCount) ?? 0;

    if (!Number.isInteger(animalCount) || animalCount < 0 || animalCount > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Animal count must be a whole number',
      });
    }

    let images = [];

    if (body.images !== undefined) {
      if (!Array.isArray(body.images) || body.images.some((image) => typeof image !== 'string')) {
        return res.status(400).json({ success: false, message: 'Images must be a list of URLs' });
      }

      if (body.images.length > MAX_IMAGES) {
        return res.status(400).json({
          success: false,
          message: `At most ${MAX_IMAGES} photos are allowed`,
        });
      }

      images = body.images.map((image) => image.trim()).filter(Boolean);
    }

    const paymentMethod = body.paymentMethod || 'cod';

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`,
      });
    }

    /* DOCTOR */

    const doctor = await Doctor.findOne({ _id: body.doctorId, isActive: true });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found or unavailable',
      });
    }

    if (String(doctor.user) === String(farmerId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request consultation from your own doctor profile',
      });
    }

    if (doctor.availability !== 'available') {
      return res.status(409).json({
        success: false,
        message: 'This doctor is currently unavailable',
      });
    }

    const availableFrom = toIndianDay(doctor.availableFrom);
    const availableUntil = toIndianDay(doctor.availableUntil);

    if ((availableFrom && date < availableFrom) || (availableUntil && date > availableUntil)) {
      return res.status(409).json({
        success: false,
        message: 'This doctor is not available on the selected date',
      });
    }

    const consultationType = DOCTOR_TYPES.find(
      (type) => type.key === doctor.doctorType
    )?.consultationType;

    if (body.consultationType && body.consultationType !== consultationType) {
      return res.status(400).json({
        success: false,
        message: `This doctor only provides ${consultationType} consultations`,
      });
    }

    /* CONFLICTS */

    const [existingConsultation, slotTaken] = await Promise.all([
      DoctorConsultation.findOne({
        farmer: farmerId,
        doctor: doctor._id,
        consultationDate: date,
        status: { $in: ACTIVE_STATUSES },
      }),

      findOverlapping({
        doctor: doctor._id,
        date,
        window: [startMinute, endMinute],
        statuses: ACCEPTED_STATUSES,
      }),
    ]);

    if (existingConsultation) {
      return res.status(409).json({
        success: false,
        message: 'You already have a consultation with this doctor for this date',
        consultation: existingConsultation,
      });
    }

    if (slotTaken.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is already booked. Please choose another time.',
      });
    }

    /*
     * The consultation is about the farmer's animals / crops, so the
     * location defaults to the farmer's profile.
     */
    const farmer = await User.findById(farmerId).select('state district village');

    const fee = doctor.consultationFeeType === 'free' ? 0 : Number(doctor.consultationFee || 0);

    const consultation = await DoctorConsultation.create({
      farmer: farmerId,
      doctor: doctor._id,
      consultationDate: date,
      startTime: String(body.startTime).trim(),
      endTime: body.endTime ? String(body.endTime).trim() : '',
      startMinute,
      endMinute,
      consultationType,
      problemType: trimText(body.problemType, 100),
      animalType: consultationType === 'veterinary' ? trimText(body.animalType, 100) : '',
      animalCount: consultationType === 'veterinary' ? animalCount : 0,
      animalAge: consultationType === 'veterinary' ? trimText(body.animalAge, 50) : '',
      cropName: consultationType === 'agricultural' ? trimText(body.cropName, 100) : '',
      symptoms: trimText(body.symptoms, 2000),
      description: trimText(body.description, 2000),
      images,
      state: trimText(body.state, 100) || farmer?.state || '',
      district: trimText(body.district, 100) || farmer?.district || '',
      village: trimText(body.village, 100) || farmer?.village || '',
      address: trimText(body.address, 300),
      consultationFee: fee,
      totalAmount: fee,
      paymentMethod,
      farmerNotes: trimText(body.farmerNotes, 1000),
      status: 'pending',
    });

    return respondWithConsultation(
      res,
      consultation._id,
      farmerId,
      201,
      'Doctor consultation request created successfully'
    );
  } catch (error) {
    console.error('Create doctor consultation error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create doctor consultation',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY CONSULTATIONS (FARMER)
|--------------------------------------------------------------------------
| GET /api/doctor-consultations/my?status=active|pending|accepted|...|all
|--------------------------------------------------------------------------
*/

export const getMyConsultations = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);
    if (!farmerId) return unauthorized(res);

    return await listConsultations(
      req,
      res,
      { farmer: farmerId },
      farmerId,
      'Consultations fetched successfully'
    );
  } catch (error) {
    console.error('Get my consultations error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch consultations',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET DOCTOR REQUESTS (DOCTOR)
|--------------------------------------------------------------------------
| GET /api/doctor-consultations/requests?status=...&date=2026-10-25
|--------------------------------------------------------------------------
*/

export const getDoctorRequests = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const doctor = await Doctor.findOne({ user: userId }).select('_id');

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found',
      });
    }

    const filters = { doctor: doctor._id };

    if (req.query.date) {
      const date = toIndianDay(req.query.date);

      if (!date || Number.isNaN(date.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date' });
      }

      filters.consultationDate = date;
    }

    return await listConsultations(
      req,
      res,
      filters,
      userId,
      'Doctor consultation requests fetched successfully'
    );
  } catch (error) {
    console.error('Get doctor requests error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor requests',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET CONSULTATION BY ID (FARMER OR DOCTOR)
|--------------------------------------------------------------------------
*/

export const getConsultationById = async (req, res) => {
  try {
    await expireStaleRequests();

    const loaded = await loadConsultationForUser(req, res);
    if (!loaded) return;

    return respondWithConsultation(
      res,
      loaded.consultation._id,
      loaded.userId,
      200,
      'Consultation fetched'
    );
  } catch (error) {
    console.error('Get consultation by ID error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch consultation',
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACCEPT CONSULTATION (DOCTOR)
|--------------------------------------------------------------------------
|
| A doctor can't have two accepted consultations at the same time. Other
| pending requests for the same time are declined automatically.
|--------------------------------------------------------------------------
*/

export const acceptConsultation = async (req, res) => {
  try {
    const loaded = await loadConsultationForUser(req, res);
    if (!loaded) return;

    const { consultation, role, userId } = loaded;

    if (role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to accept this consultation',
      });
    }

    if (consultation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Consultation is already ${consultation.status}`,
      });
    }

    if (consultation.consultationDate < todayInIndia()) {
      await expireStaleRequests();

      return res.status(400).json({
        success: false,
        message: 'This request has expired because the date has passed',
      });
    }

    const slot = {
      doctor: consultation.doctor._id,
      date: consultation.consultationDate,
      window: timeWindow(consultation),
      excludeId: consultation._id,
    };

    if ((await findOverlapping({ ...slot, statuses: ACCEPTED_STATUSES })).length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You already have an accepted consultation at this time',
      });
    }

    const acceptedAt = new Date();

    const updated = await DoctorConsultation.findOneAndUpdate(
      { _id: consultation._id, status: 'pending' },
      { $set: { status: 'accepted', acceptedAt } },
      { returnDocument: 'after' }
    );

    if (!updated) return staleResponse(res);

    /*
     * Two overlapping requests accepted at the same moment: the one
     * accepted first keeps the slot, the other goes back to pending.
     */
    const conflict = (await findOverlapping({ ...slot, statuses: ACCEPTED_STATUSES })).some(
      (other) =>
        !other.acceptedAt ||
        other.acceptedAt < acceptedAt ||
        (other.acceptedAt.getTime() === acceptedAt.getTime() &&
          String(other._id) < String(consultation._id))
    );

    if (conflict) {
      await DoctorConsultation.updateOne(
        { _id: consultation._id, status: 'accepted' },
        { $set: { status: 'pending', acceptedAt: null } }
      );

      return res.status(409).json({
        success: false,
        message: 'You already have an accepted consultation at this time',
      });
    }

    const overlappingPending = await findOverlapping({ ...slot, statuses: ['pending'] });

    if (overlappingPending.length > 0) {
      await DoctorConsultation.updateMany(
        { _id: { $in: overlappingPending.map((other) => other._id) }, status: 'pending' },
        {
          $set: {
            status: 'rejected',
            rejectionReason: 'The doctor is already booked at this time',
            cancellationReason: 'The doctor is already booked at this time',
          },
        }
      );
    }

    return respondWithConsultation(
      res,
      consultation._id,
      userId,
      200,
      'Consultation accepted successfully. You can now see each other’s phone numbers.'
    );
  } catch (error) {
    console.error('Accept consultation error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to accept consultation',
    });
  }
};

/*
|--------------------------------------------------------------------------
| REJECT CONSULTATION (DOCTOR)
|--------------------------------------------------------------------------
*/

export const rejectConsultation = async (req, res) => {
  try {
    const loaded = await loadConsultationForUser(req, res);
    if (!loaded) return;

    const { consultation, role, userId } = loaded;

    if (role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reject this consultation',
      });
    }

    const reason = trimText(req.body?.reason);

    const updated = await DoctorConsultation.findOneAndUpdate(
      { _id: consultation._id, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          rejectionReason: reason,
          // kept for older app versions that read the reason here
          cancellationReason: reason,
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: `Consultation is already ${consultation.status}`,
      });
    }

    return respondWithConsultation(
      res,
      consultation._id,
      userId,
      200,
      'Consultation rejected successfully'
    );
  } catch (error) {
    console.error('Reject consultation error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to reject consultation',
    });
  }
};

/*
|--------------------------------------------------------------------------
| CANCEL CONSULTATION (FARMER OR DOCTOR)
|--------------------------------------------------------------------------
*/

export const cancelConsultation = async (req, res) => {
  try {
    const loaded = await loadConsultationForUser(req, res);
    if (!loaded) return;

    const { consultation, role, userId } = loaded;

    if (!ACTIVE_STATUSES.includes(consultation.status)) {
      return res.status(400).json({
        success: false,
        message: `Consultation cannot be cancelled because it is already ${consultation.status}`,
      });
    }

    const updated = await DoctorConsultation.findOneAndUpdate(
      { _id: consultation._id, status: consultation.status },
      {
        $set: {
          status: 'cancelled',
          cancelledBy: role,
          cancelledAt: new Date(),
          cancellationReason: trimText(req.body?.reason),
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) return staleResponse(res);

    return respondWithConsultation(
      res,
      consultation._id,
      userId,
      200,
      'Consultation cancelled successfully'
    );
  } catch (error) {
    console.error('Cancel consultation error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to cancel consultation',
    });
  }
};

/*
|--------------------------------------------------------------------------
| COMPLETE CONSULTATION (FARMER OR DOCTOR)
|--------------------------------------------------------------------------
| PATCH /api/doctor-consultations/:id/complete
|
| Doctor may send { doctorNotes, diagnosis, prescription, followUpDate }.
| Allowed on or after the consultation date.
|--------------------------------------------------------------------------
*/

export const completeConsultation = async (req, res) => {
  try {
    const loaded = await loadConsultationForUser(req, res);
    if (!loaded) return;

    const { consultation, role, userId } = loaded;

    if (!ACCEPTED_STATUSES.includes(consultation.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only accepted consultations can be completed',
      });
    }

    if (consultation.consultationDate > todayInIndia()) {
      return res.status(400).json({
        success: false,
        message: 'A consultation can be completed only on or after its date',
      });
    }

    let outcome = {};

    if (role === 'doctor') {
      const { update, error } = buildOutcome(req.body);

      if (error) return res.status(400).json({ success: false, message: error });

      outcome = update;
    }

    const updated = await DoctorConsultation.findOneAndUpdate(
      { _id: consultation._id, status: { $in: ACCEPTED_STATUSES } },
      { $set: { ...outcome, status: 'completed', completedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!updated) return staleResponse(res);

    await Doctor.updateOne({ _id: consultation.doctor._id }, { $inc: { totalConsultations: 1 } });

    return respondWithConsultation(
      res,
      consultation._id,
      userId,
      200,
      'Consultation completed successfully'
    );
  } catch (error) {
    console.error('Complete consultation error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to complete consultation',
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE NOTES (DOCTOR)
|--------------------------------------------------------------------------
| PATCH /api/doctor-consultations/:id/notes
|
| { doctorNotes, diagnosis, prescription, followUpDate }
|
| The doctor can add or correct these on an accepted or completed
| consultation.
|--------------------------------------------------------------------------
*/

export const updateConsultationNotes = async (req, res) => {
  try {
    const loaded = await loadConsultationForUser(req, res);
    if (!loaded) return;

    const { consultation, role, userId } = loaded;

    if (role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only the doctor can update consultation notes',
      });
    }

    const { update, error } = buildOutcome(req.body);

    if (error) return res.status(400).json({ success: false, message: error });

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const updated = await DoctorConsultation.findOneAndUpdate(
      { _id: consultation._id, status: { $in: [...ACCEPTED_STATUSES, 'completed'] } },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: 'Notes can be added only to accepted or completed consultations',
      });
    }

    return respondWithConsultation(res, consultation._id, userId, 200, 'Consultation notes saved');
  } catch (error) {
    console.error('Update consultation notes error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to save notes',
    });
  }
};

/*
|--------------------------------------------------------------------------
| REVIEW DOCTOR (FARMER)
|--------------------------------------------------------------------------
| POST /api/doctor-consultations/:id/review   { "rating": 1-5, "comment" }
|
| One review per completed consultation. Updates the doctor's rating.
|--------------------------------------------------------------------------
*/

export const reviewConsultation = async (req, res) => {
  try {
    const loaded = await loadConsultationForUser(req, res);
    if (!loaded) return;

    const { consultation, role, userId } = loaded;

    if (role !== 'farmer') {
      return res.status(403).json({
        success: false,
        message: 'Only the farmer can review this consultation',
      });
    }

    const rating = Number(req.body?.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a whole number from 1 to 5',
      });
    }

    const updated = await DoctorConsultation.findOneAndUpdate(
      { _id: consultation._id, status: 'completed', 'review.rating': null },
      {
        $set: {
          'review.rating': rating,
          'review.comment': trimText(req.body?.comment),
          'review.createdAt': new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message:
          consultation.status !== 'completed'
            ? 'You can review only after the consultation is completed'
            : 'You have already reviewed this consultation',
      });
    }

    await refreshDoctorRating(consultation.doctor._id);

    return respondWithConsultation(res, consultation._id, userId, 200, 'Thank you for your review');
  } catch (error) {
    console.error('Review consultation error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to submit review',
    });
  }
};
