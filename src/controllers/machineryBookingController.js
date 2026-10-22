import mongoose from 'mongoose';

import MachineryBooking from '../models/MachineryBooking.js';
import Machinery from '../models/Machinery.js';
import User from '../models/User.js';

import {
  PRICING_TYPES,
  PAYMENT_METHODS,
  MAX_BOOKING_DAYS,
  MAX_BOOKING_HOURS,
} from '../data/machineryOptions.js';
import { toIndianDay, todayInIndia, addDays } from '../utils/indiaDate.js';
import { parseTime, formatTime, MINUTES_PER_DAY } from '../utils/timeOfDay.js';

const FARMER_FIELDS = 'fullName phoneNumber village taluka district state';

const OWNER_FIELDS = 'fullName phoneNumber village district state';

const MACHINERY_FIELDS =
  'name category brand model modelYear images enginePower fuelType driveType supportsImplements supportedImplements pricing availability state district village address owner ownerName rating totalReviews totalJobsCompleted';

const CONFIRMED_STATUSES = ['confirmed', 'accepted'];

const ACTIVE_STATUSES = ['pending', ...CONFIRMED_STATUSES];

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getAuthenticatedUserId = (req) => req.user?.userId || null;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const trimText = (value, max = 500) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const roundMoney = (value) => Math.round(value * 100) / 100;

const sameText = (a, b) =>
  String(a || '')
    .trim()
    .toLowerCase() ===
  String(b || '')
    .trim()
    .toLowerCase();

/*
 * The minutes of each day a booking blocks the machine. Older bookings
 * without minutes block the whole day.
 */
const timeWindow = (booking) => [booking.startMinute ?? 0, booking.endMinute ?? MINUTES_PER_DAY];

const windowsOverlap = ([startA, endA], [startB, endB]) => startA < endB && startB < endA;

/*
 * Bookings for a machine whose dates and daily times overlap the given
 * schedule.
 */
const findOverlapping = async ({ machinery, statuses, start, end, window, excludeId, extra }) => {
  const candidates = await MachineryBooking.find({
    machinery,
    status: { $in: statuses },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    ...(extra || {}),
    bookingDate: { $lte: end },
    $or: [{ endDate: { $gte: start } }, { endDate: null, bookingDate: { $gte: start } }],
  }).lean();

  return candidates.filter((booking) => windowsOverlap(timeWindow(booking), window));
};

/*
 * Pending requests whose work date has passed can no longer happen.
 */
const expireStaleRequests = () =>
  MachineryBooking.updateMany(
    { status: 'pending', bookingDate: { $lt: todayInIndia() } },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'system',
        cancelledAt: new Date(),
        cancellationReason: 'Request expired: the owner did not respond before the work date',
      },
    }
  );

const getRole = (booking, userId) => {
  const farmerId = String(booking.farmer?._id || booking.farmer);
  const owner = booking.machinery?.owner;
  const ownerId = owner ? String(owner._id || owner) : '';

  if (farmerId === String(userId)) return 'farmer';
  if (ownerId && ownerId === String(userId)) return 'owner';
  return null;
};

/*
 * Phone numbers are only shared once the owner has confirmed.
 */
const formatBooking = (booking, userId) => {
  const plain = typeof booking.toObject === 'function' ? booking.toObject() : booking;
  const shareContact = [...CONFIRMED_STATUSES, 'completed'].includes(plain.status);

  const withoutPhone = (party) => {
    if (!party || typeof party !== 'object' || shareContact) return party;

    const { phoneNumber, ...rest } = party;
    return rest;
  };

  const myRole = getRole(plain, userId);

  return {
    ...plain,
    farmer: withoutPhone(plain.farmer),
    machinery: plain.machinery
      ? { ...plain.machinery, owner: withoutPhone(plain.machinery.owner) }
      : plain.machinery,
    myRole,
    canReview: myRole === 'farmer' && plain.status === 'completed' && !plain.review?.rating,
  };
};

const populateBooking = (query) =>
  query.populate('farmer', FARMER_FIELDS).populate({
    path: 'machinery',
    select: MACHINERY_FIELDS,
    populate: { path: 'owner', select: OWNER_FIELDS },
  });

const respondWithBooking = async (res, bookingId, userId, status, message) => {
  const booking = await populateBooking(MachineryBooking.findById(bookingId)).lean();

  return res.status(status).json({
    success: true,
    message,
    booking: formatBooking(booking, userId),
  });
};

/*
 * Loads a booking the current user is part of. Sends the error response
 * itself and returns null when the booking can't be used.
 */
const loadBookingForUser = async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  const { id } = req.params;

  if (!isValidId(id)) {
    res.status(400).json({ success: false, message: 'Invalid booking ID' });
    return null;
  }

  const booking = await MachineryBooking.findById(id).populate('machinery', 'owner');

  if (!booking) {
    res.status(404).json({ success: false, message: 'Booking not found' });
    return null;
  }

  const role = getRole(booking, userId);

  if (!role) {
    res.status(403).json({ success: false, message: 'You are not part of this booking' });
    return null;
  }

  return { booking, role, userId };
};

const staleBookingResponse = (res) =>
  res.status(409).json({
    success: false,
    message: 'This booking was just updated. Please refresh and try again.',
  });

/*
 * Keep the machine's rating in sync with its reviews.
 */
const refreshMachineryRating = async (machineryId) => {
  const [stats] = await MachineryBooking.aggregate([
    {
      $match: {
        machinery: new mongoose.Types.ObjectId(String(machineryId)),
        status: 'completed',
        'review.rating': { $ne: null },
      },
    },
    { $group: { _id: null, average: { $avg: '$review.rating' }, count: { $sum: 1 } } },
  ]);

  await Machinery.updateOne(
    { _id: machineryId },
    {
      $set: {
        rating: stats ? Math.round(stats.average * 10) / 10 : 0,
        totalReviews: stats ? stats.count : 0,
      },
    }
  );
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
 *   active    -> pending + confirmed
 *   confirmed -> confirmed (incl. old 'accepted')
 *   all       -> no filter
 */
const statusFilter = (status, fallback) => {
  if (!status) return fallback;
  if (status === 'all') return undefined;
  if (status === 'active') return { $in: ACTIVE_STATUSES };
  if (status === 'confirmed' || status === 'accepted') return { $in: CONFIRMED_STATUSES };
  return status;
};

/*
 * Works out price and schedule from the machine's rates.
 *
 *   hourly -> hourly rate x hours, same day, from startTime
 *   daily  -> daily rate x days, whole days
 *   custom -> one of the owner's custom rates x quantity
 *             (hour -> hours from startTime, day -> whole days,
 *              acre / job / custom -> one day, startTime to endTime)
 *
 * Returns { plan } or { error }.
 */
const planBooking = ({ machinery, body, startDate, startMinutes, endMinutes }) => {
  const pricingType = body.pricingType || 'daily';

  if (!PRICING_TYPES.includes(pricingType)) {
    return { error: `Pricing type must be one of: ${PRICING_TYPES.join(', ')}` };
  }

  const duration = parseNumber(body.duration);

  const hoursPlan = (rate, hours) => {
    if (hours === null || !Number.isFinite(hours) || hours <= 0 || hours > MAX_BOOKING_HOURS) {
      return { error: `Duration must be between 0 and ${MAX_BOOKING_HOURS} hours` };
    }

    const end = startMinutes + Math.round(hours * 60);

    if (end > MINUTES_PER_DAY) {
      return { error: 'An hourly booking must finish on the same day' };
    }

    return {
      plan: {
        duration: hours,
        durationUnit: 'hours',
        rate,
        basePrice: roundMoney(rate * hours),
        endDate: startDate,
        startMinute: startMinutes,
        endMinute: end,
      },
    };
  };

  const daysPlan = (rate, days) => {
    if (!Number.isInteger(days) || days < 1 || days > MAX_BOOKING_DAYS) {
      return { error: `Number of days must be a whole number from 1 to ${MAX_BOOKING_DAYS}` };
    }

    return {
      plan: {
        duration: days,
        durationUnit: 'days',
        rate,
        basePrice: roundMoney(rate * days),
        endDate: addDays(startDate, days - 1),
        startMinute: 0,
        endMinute: MINUTES_PER_DAY,
      },
    };
  };

  let result;

  if (pricingType === 'hourly') {
    const rate = Number(machinery.pricing?.hourly || 0);
    if (rate <= 0) return { error: 'This machinery is not available on hourly rent' };

    result = hoursPlan(rate, duration);
  } else if (pricingType === 'daily') {
    const rate = Number(machinery.pricing?.daily || 0);
    if (rate <= 0) return { error: 'This machinery is not available on daily rent' };

    result = daysPlan(rate, duration ?? 1);
  } else {
    /*
     * Custom: the farmer picks one of the owner's rates by its id
     * (customRateId) or name (customRateName / service).
     */
    const rates = machinery.pricing?.custom || [];
    const { customRateId } = body;
    const rateName = body.customRateName || body.service;

    const customRate =
      (customRateId && rates.find((rate) => String(rate._id) === String(customRateId))) ||
      (rateName && rates.find((rate) => sameText(rate.name, rateName)));

    if (!customRate) {
      return {
        error: rates.length
          ? 'Select one of the owner’s custom rates'
          : 'This machinery has no custom rates',
      };
    }

    const quantity = duration ?? 1;

    if (customRate.unit === 'hour') {
      result = hoursPlan(customRate.amount, quantity);
    } else if (customRate.unit === 'day') {
      result = daysPlan(customRate.amount, quantity);
    } else {
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
        return { error: `Enter a valid number of ${customRate.unit}s` };
      }

      result = {
        plan: {
          duration: quantity,
          durationUnit: { acre: 'acres', job: 'jobs' }[customRate.unit] || 'custom',
          rate: customRate.amount,
          basePrice: roundMoney(customRate.amount * quantity),
          endDate: startDate,
          startMinute: startMinutes,
          endMinute: endMinutes ?? MINUTES_PER_DAY,
        },
      };
    }

    if (result.plan) {
      result.plan.customRate = {
        name: customRate.name,
        amount: customRate.amount,
        unit: customRate.unit,
      };
    }
  }

  if (result.plan) result.plan.pricingType = pricingType;

  return result;
};

/*
|--------------------------------------------------------------------------
| CREATE MACHINERY BOOKING
|--------------------------------------------------------------------------
|
| POST /api/machinery-bookings
|
| {
|   "machinery": "<machinery id>",
|   "bookingDate": "2026-10-25",
|   "startTime": "08:00",               // "08:00" or "8:00 AM"
|   "endTime": "12:00",                 // optional (used for acre / job rates)
|   "workType": "Ploughing",
|   "pricingType": "hourly" | "daily" | "custom",
|   "duration": 4,                      // hours, days, or quantity of the custom rate
|   "customRateId": "...",              // for custom (or customRateName / service)
|   "selectedImplement": "Rotavator",
|   "state", "district", "village", "address",   // default to farmer's profile
|   "farmName", "farmLocation", "farmSize", "crop",
|   "paymentMethod": "cod",
|   "farmerNotes": "..."
| }
|
| Prices are calculated by the server from the machine's rates.
|
*/

export const createMachineryBooking = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);
    const body = req.body || {};

    if (!isValidId(body.machinery)) {
      return res.status(400).json({
        success: false,
        message: 'A valid machinery ID is required',
      });
    }

    /* DATE / TIME */

    const startDate = toIndianDay(body.bookingDate);

    if (!startDate || Number.isNaN(startDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'A valid booking date is required',
      });
    }

    if (startDate < todayInIndia()) {
      return res.status(400).json({
        success: false,
        message: 'Booking date cannot be in the past',
      });
    }

    const startMinutes = body.startTime ? parseTime(body.startTime) : null;

    if (startMinutes === null) {
      return res.status(400).json({
        success: false,
        message: 'A valid start time is required (e.g. 08:00 or 8:00 AM)',
      });
    }

    let endMinutes = null;

    if (body.endTime) {
      endMinutes = parseTime(body.endTime);

      if (endMinutes === null) {
        return res.status(400).json({ success: false, message: 'Invalid end time' });
      }

      if (endMinutes <= startMinutes) {
        return res.status(400).json({
          success: false,
          message: 'End time must be after start time',
        });
      }
    }

    if (!body.workType || !String(body.workType).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Work type is required',
      });
    }

    const paymentMethod = body.paymentMethod || 'cod';

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`,
      });
    }

    /* MACHINERY */

    const machinery = await Machinery.findOne({ _id: body.machinery, isActive: true });

    if (!machinery) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found or unavailable',
      });
    }

    if (machinery.owner && String(machinery.owner) === String(farmerId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot book your own machinery',
      });
    }

    if (machinery.availability !== 'available') {
      return res.status(409).json({
        success: false,
        message: 'This machinery is currently unavailable',
      });
    }

    /* IMPLEMENT */

    const selectedImplement = trimText(body.selectedImplement, 100);

    if (selectedImplement) {
      if (!machinery.supportsImplements) {
        return res.status(400).json({
          success: false,
          message: 'This machinery does not support implements',
        });
      }

      if (
        !(machinery.supportedImplements || []).some((item) => sameText(item, selectedImplement))
      ) {
        return res.status(400).json({
          success: false,
          message: 'Selected implement is not supported by this machinery',
        });
      }
    }

    /* PRICE + SCHEDULE */

    const { plan, error } = planBooking({
      machinery,
      body,
      startDate,
      startMinutes,
      endMinutes,
    });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const availableFrom = toIndianDay(machinery.availableFrom);
    const availableUntil = toIndianDay(machinery.availableUntil);

    if (
      (availableFrom && startDate < availableFrom) ||
      (availableUntil && plan.endDate > availableUntil)
    ) {
      return res.status(409).json({
        success: false,
        message: 'This machinery is not available for the selected dates',
      });
    }

    /* CONFLICTS */

    const schedule = {
      machinery: machinery._id,
      start: startDate,
      end: plan.endDate,
      window: [plan.startMinute, plan.endMinute],
    };

    const [myOverlapping, confirmedOverlapping] = await Promise.all([
      findOverlapping({
        ...schedule,
        statuses: ACTIVE_STATUSES,
        extra: { farmer: farmerId },
      }),
      findOverlapping({ ...schedule, statuses: CONFIRMED_STATUSES }),
    ]);

    if (myOverlapping.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You already have a booking for this machinery at this time',
        booking: myOverlapping[0],
      });
    }

    if (confirmedOverlapping.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This machinery is already booked at this time',
      });
    }

    /*
     * The machine comes to the farmer's farm, so the location defaults
     * to the farmer's profile.
     */
    const farmer = await User.findById(farmerId).select('state district village');

    const booking = await MachineryBooking.create({
      farmer: farmerId,
      machinery: machinery._id,
      bookingDate: startDate,
      endDate: plan.endDate,
      startTime: String(body.startTime).trim(),
      endTime:
        plan.endMinute < MINUTES_PER_DAY && plan.durationUnit === 'hours'
          ? formatTime(plan.endMinute)
          : trimText(body.endTime, 20),
      startMinute: plan.startMinute,
      endMinute: plan.endMinute,
      workType: trimText(body.workType, 100),
      service: trimText(body.service, 100),
      selectedImplement,
      pricingType: plan.pricingType,
      customRate: plan.customRate || undefined,
      duration: plan.duration,
      durationUnit: plan.durationUnit,
      rate: plan.rate,
      basePrice: plan.basePrice,
      platformFee: 0,
      taxes: 0,
      totalAmount: plan.basePrice,
      state: trimText(body.state, 100) || farmer?.state || '',
      district: trimText(body.district, 100) || farmer?.district || '',
      village: trimText(body.village, 100) || farmer?.village || '',
      address: trimText(body.address, 300),
      farmName: trimText(body.farmName, 100),
      farmLocation: trimText(body.farmLocation, 300),
      farmSize: trimText(body.farmSize, 50),
      crop: trimText(body.crop, 100),
      paymentMethod,
      farmerNotes: trimText(body.farmerNotes),
      status: 'pending',
    });

    return respondWithBooking(
      res,
      booking._id,
      farmerId,
      201,
      'Machinery rental request sent successfully'
    );
  } catch (error) {
    console.error('CREATE MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create machinery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| FARMER - MY MACHINERY BOOKINGS
|--------------------------------------------------------------------------
|
| GET /api/machinery-bookings/my-bookings?status=active|pending|confirmed|...|all
|
*/

export const getMyMachineryBookings = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);

    await expireStaleRequests();

    const filter = { farmer: farmerId };

    const status = statusFilter(req.query.status, undefined);
    if (status) filter.status = status;

    const { currentPage, perPage, skip } = paginate(req.query);

    const [bookings, total] = await Promise.all([
      populateBooking(MachineryBooking.find(filter))
        .sort({ bookingDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      MachineryBooking.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: bookings.length,
      total,
      pagination: paginationInfo(currentPage, perPage, total),
      bookings: bookings.map((booking) => formatBooking(booking, farmerId)),
    });
  } catch (error) {
    console.error('GET MY MACHINERY BOOKINGS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery bookings',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| MACHINERY OWNER - REQUESTS
|--------------------------------------------------------------------------
|
| GET /api/machinery-bookings/requests?status=...&machineryId=...
|
| Without status: pending + confirmed. status=all: everything.
|
*/

export const getMachineryRequests = async (req, res) => {
  try {
    const ownerId = getAuthenticatedUserId(req);
    const { machineryId } = req.query;

    const ownedFilter = { owner: ownerId };

    if (machineryId) {
      if (!isValidId(machineryId)) {
        return res.status(400).json({ success: false, message: 'Invalid machinery ID' });
      }

      ownedFilter._id = machineryId;
    }

    const machinery = await Machinery.find(ownedFilter).select('_id');

    if (machinery.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        requests: [],
      });
    }

    await expireStaleRequests();

    const filter = { machinery: { $in: machinery.map((item) => item._id) } };

    const status = statusFilter(req.query.status, { $in: ACTIVE_STATUSES });
    if (status) filter.status = status;

    const { currentPage, perPage, skip } = paginate(req.query);

    const [requests, total] = await Promise.all([
      populateBooking(MachineryBooking.find(filter))
        .sort({ bookingDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      MachineryBooking.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: requests.length,
      total,
      pagination: paginationInfo(currentPage, perPage, total),
      requests: requests.map((booking) => formatBooking(booking, ownerId)),
    });
  } catch (error) {
    console.error('GET MACHINERY REQUESTS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery requests',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET BOOKING BY ID (FARMER OR OWNER)
|--------------------------------------------------------------------------
*/

export const getMachineryBookingById = async (req, res) => {
  try {
    await expireStaleRequests();

    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    return respondWithBooking(res, loaded.booking._id, loaded.userId, 200, 'Booking fetched');
  } catch (error) {
    console.error('GET MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACCEPT BOOKING (OWNER)
|--------------------------------------------------------------------------
|
| PATCH /api/machinery-bookings/:id/accept   { "ownerNotes": "..." }
|
| A machine can't have two confirmed bookings at the same time. Other
| pending requests for the same time are declined automatically.
|
*/

export const acceptMachineryBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    if (role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to accept this booking',
      });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This booking is already ${booking.status}`,
      });
    }

    if (booking.bookingDate < todayInIndia()) {
      await expireStaleRequests();

      return res.status(400).json({
        success: false,
        message: 'This request has expired because the work date has passed',
      });
    }

    const schedule = {
      machinery: booking.machinery._id,
      start: booking.bookingDate,
      end: booking.endDate || booking.bookingDate,
      window: timeWindow(booking),
      excludeId: booking._id,
    };

    const alreadyBooked = await findOverlapping({ ...schedule, statuses: CONFIRMED_STATUSES });

    if (alreadyBooked.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This machinery is already booked at this time',
      });
    }

    const acceptedAt = new Date();

    const update = { status: 'confirmed', acceptedAt };
    if (req.body?.ownerNotes !== undefined) update.ownerNotes = trimText(req.body.ownerNotes);

    const updated = await MachineryBooking.findOneAndUpdate(
      { _id: booking._id, status: 'pending' },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!updated) return staleBookingResponse(res);

    /*
     * Two overlapping requests confirmed at the same moment: the one
     * confirmed first keeps it, the other goes back to pending.
     */
    const conflict = (await findOverlapping({ ...schedule, statuses: CONFIRMED_STATUSES })).some(
      (other) =>
        !other.acceptedAt ||
        other.acceptedAt < acceptedAt ||
        (other.acceptedAt.getTime() === acceptedAt.getTime() &&
          String(other._id) < String(booking._id))
    );

    if (conflict) {
      await MachineryBooking.updateOne(
        { _id: booking._id, status: 'confirmed' },
        { $set: { status: 'pending', acceptedAt: null } }
      );

      return res.status(409).json({
        success: false,
        message: 'This machinery is already booked at this time',
      });
    }

    const overlappingPending = await findOverlapping({ ...schedule, statuses: ['pending'] });

    if (overlappingPending.length > 0) {
      await MachineryBooking.updateMany(
        { _id: { $in: overlappingPending.map((other) => other._id) }, status: 'pending' },
        {
          $set: {
            status: 'rejected',
            rejectionReason: 'The machinery is already booked at this time',
          },
        }
      );
    }

    return respondWithBooking(
      res,
      booking._id,
      userId,
      200,
      'Machinery booking accepted and confirmed. You can now see each other’s phone numbers.'
    );
  } catch (error) {
    console.error('ACCEPT MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept machinery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| REJECT BOOKING (OWNER)
|--------------------------------------------------------------------------
*/

export const rejectMachineryBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    if (role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to reject this booking',
      });
    }

    const updated = await MachineryBooking.findOneAndUpdate(
      { _id: booking._id, status: 'pending' },
      { $set: { status: 'rejected', rejectionReason: trimText(req.body?.reason) } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: `Cannot reject a ${booking.status} booking`,
      });
    }

    return respondWithBooking(res, booking._id, userId, 200, 'Machinery booking request rejected');
  } catch (error) {
    console.error('REJECT MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject machinery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| CANCEL BOOKING (FARMER OR OWNER)
|--------------------------------------------------------------------------
*/

export const cancelMachineryBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    if (!ACTIVE_STATUSES.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a ${booking.status} booking`,
      });
    }

    const updated = await MachineryBooking.findOneAndUpdate(
      { _id: booking._id, status: booking.status },
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

    if (!updated) return staleBookingResponse(res);

    return respondWithBooking(
      res,
      booking._id,
      userId,
      200,
      'Machinery booking cancelled successfully'
    );
  } catch (error) {
    console.error('CANCEL MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel machinery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| COMPLETE BOOKING (FARMER OR OWNER)
|--------------------------------------------------------------------------
|
| Allowed once the work has started (on or after the booking date).
|
*/

export const completeMachineryBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, userId } = loaded;

    if (!CONFIRMED_STATUSES.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only confirmed bookings can be completed',
      });
    }

    if (booking.bookingDate > todayInIndia()) {
      return res.status(400).json({
        success: false,
        message: 'A booking can be completed only after the work has started',
      });
    }

    const updated = await MachineryBooking.findOneAndUpdate(
      { _id: booking._id, status: { $in: CONFIRMED_STATUSES } },
      { $set: { status: 'completed', completedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!updated) return staleBookingResponse(res);

    await Machinery.updateOne({ _id: booking.machinery._id }, { $inc: { totalJobsCompleted: 1 } });

    return respondWithBooking(
      res,
      booking._id,
      userId,
      200,
      'Machinery booking completed successfully'
    );
  } catch (error) {
    console.error('COMPLETE MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete machinery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| REVIEW (FARMER)
|--------------------------------------------------------------------------
|
| POST /api/machinery-bookings/:id/review   { "rating": 1-5, "comment": "..." }
|
| One review per completed booking. Updates the machine's rating.
|
*/

export const reviewMachineryBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    if (role !== 'farmer') {
      return res.status(403).json({
        success: false,
        message: 'Only the farmer can review this booking',
      });
    }

    const rating = Number(req.body?.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a whole number from 1 to 5',
      });
    }

    const updated = await MachineryBooking.findOneAndUpdate(
      { _id: booking._id, status: 'completed', 'review.rating': null },
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
          booking.status !== 'completed'
            ? 'You can review only after the work is completed'
            : 'You have already reviewed this booking',
      });
    }

    await refreshMachineryRating(booking.machinery._id);

    return respondWithBooking(res, booking._id, userId, 200, 'Thank you for your review');
  } catch (error) {
    console.error('REVIEW MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: error.message,
    });
  }
};
