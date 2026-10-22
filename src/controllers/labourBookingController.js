import mongoose from 'mongoose';

import LabourBooking from '../models/LabourBooking.js';
import Labourer from '../models/Labourer.js';
import User from '../models/User.js';

import { WAGE_TYPES, MAX_BOOKING_DAYS } from '../data/labourOptions.js';
import { toIndianDay, todayInIndia, addDays } from '../utils/indiaDate.js';
import { parseTime } from '../utils/timeOfDay.js';

const LABOURER_FIELDS =
  'user fullName phoneNumber profileImage labourType skills experience experienceUnit expectedWage wageType village district state gender age rating totalReviews totalJobsCompleted languages preferredWork';

const FARMER_FIELDS = 'fullName phoneNumber village taluka district state';

const ACTIVE_STATUSES = ['pending', 'accepted', 'confirmed'];

const ACCEPTED_STATUSES = ['accepted', 'confirmed'];

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

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const trimText = (value, max = 500) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const roundMoney = (value) => Math.round(value * 100) / 100;

/*
 * Total payable for the booking, calculated on the server.
 *
 *   daily   -> wage x days
 *   hourly  -> wage x hours per day x days
 *   monthly -> wage x months (30 days each, rounded up)
 */
const calculateTotal = ({ wage, wageType, numberOfDays, hoursPerDay }) => {
  if (wageType === 'hourly') return roundMoney(wage * hoursPerDay * numberOfDays);
  if (wageType === 'monthly') return roundMoney(wage * Math.ceil(numberOfDays / 30));
  return roundMoney(wage * numberOfDays);
};

/*
 * Bookings whose dates overlap [start, end]. Older bookings without an
 * endDate are single-day bookings.
 */
const overlapFilter = (start, end) => ({
  bookingDate: { $lte: end },
  $or: [{ endDate: { $gte: start } }, { endDate: null, bookingDate: { $gte: start } }],
});

const bookingEnd = (booking) => booking.endDate || booking.bookingDate;

/*
 * Pending requests whose work date has passed can no longer happen.
 */
const expireStaleRequests = () =>
  LabourBooking.updateMany(
    { status: 'pending', bookingDate: { $lt: todayInIndia() } },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'system',
        cancelledAt: new Date(),
        cancellationReason: 'Request expired: the labourer did not respond before the work date',
      },
    }
  );

const getRole = (booking, userId) => {
  const farmerId = String(booking.farmer?._id || booking.farmer);
  const labourerUserId = String(booking.labourer?.user || '');

  if (farmerId === String(userId)) return 'farmer';
  if (labourerUserId && labourerUserId === String(userId)) return 'labourer';
  return null;
};

/*
 * Phone numbers are only shared once the labourer has accepted.
 */
const formatBooking = (booking, userId) => {
  const plain = typeof booking.toObject === 'function' ? booking.toObject() : booking;
  const shareContact = [...ACCEPTED_STATUSES, 'completed'].includes(plain.status);

  const withoutPhone = (party) => {
    if (!party || typeof party !== 'object' || shareContact) return party;

    const { phoneNumber, ...rest } = party;
    return rest;
  };

  const myRole = getRole(plain, userId);

  return {
    ...plain,
    farmer: withoutPhone(plain.farmer),
    labourer: withoutPhone(plain.labourer),
    myRole,
    canReview: myRole === 'farmer' && plain.status === 'completed' && !plain.review?.rating,
  };
};

const populateBooking = (query) =>
  query.populate('labourer', LABOURER_FIELDS).populate('farmer', FARMER_FIELDS);

const respondWithBooking = async (res, bookingId, userId, status, message) => {
  const booking = await populateBooking(LabourBooking.findById(bookingId)).lean();

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

  if (!userId) {
    res.status(401).json({ success: false, message: 'Authenticated user not found' });
    return null;
  }

  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400).json({ success: false, message: 'Invalid booking ID' });
    return null;
  }

  const booking = await LabourBooking.findById(id).populate('labourer', 'user');

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
 * Keep the labourer's rating in sync with their reviews.
 */
const refreshLabourerRating = async (labourerId) => {
  const [stats] = await LabourBooking.aggregate([
    {
      $match: {
        labourer: new mongoose.Types.ObjectId(String(labourerId)),
        status: 'completed',
        'review.rating': { $ne: null },
      },
    },
    { $group: { _id: null, average: { $avg: '$review.rating' }, count: { $sum: 1 } } },
  ]);

  await Labourer.updateOne(
    { _id: labourerId },
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
 *   active -> pending + accepted
 *   all / empty -> no filter
 */
const statusFilter = (status) => {
  if (!status || status === 'all') return undefined;
  if (status === 'active') return { $in: ACTIVE_STATUSES };
  if (status === 'accepted') return { $in: ACCEPTED_STATUSES };
  return status;
};

/*
|--------------------------------------------------------------------------
| CREATE BOOKING
|--------------------------------------------------------------------------
|
| POST /api/labour-bookings
|
| {
|   "labourerId": "...",
|   "bookingDate": "2026-10-25",
|   "numberOfDays": 2,            // optional, default 1
|   "startTime": "08:00",         // "08:00" or "8:00 AM"
|   "endTime": "17:00",           // required for hourly wage
|   "workType": "Harvesting",
|   "description": "...",
|   "wage": 500,                  // optional, defaults to labourer's expected wage
|   "wageType": "daily",          // optional, defaults to labourer's wage type
|   "state", "district", "village", "address",  // default to farmer's profile
|   "farmerNotes": "..."
| }
|
| totalAmount is calculated by the server.
|
*/

export const createLabourBooking = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);

    if (!farmerId || !isValidObjectId(farmerId)) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const {
      labourerId,
      bookingDate,
      startTime,
      endTime,
      workType,
      description,
      state,
      district,
      village,
      address,
      wage,
      wageType,
      farmerNotes,
    } = req.body;

    if (!isValidObjectId(labourerId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid labourer ID is required',
      });
    }

    /* DATES */

    const startDate = toIndianDay(bookingDate);

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

    const numberOfDays = parseNumber(req.body.numberOfDays) ?? 1;

    if (!Number.isInteger(numberOfDays) || numberOfDays < 1 || numberOfDays > MAX_BOOKING_DAYS) {
      return res.status(400).json({
        success: false,
        message: `Number of days must be a whole number from 1 to ${MAX_BOOKING_DAYS}`,
      });
    }

    const endDate = addDays(startDate, numberOfDays - 1);

    /* TIME */

    const startMinutes = startTime ? parseTime(startTime) : null;

    if (startMinutes === null) {
      return res.status(400).json({
        success: false,
        message: 'A valid start time is required (e.g. 08:00 or 8:00 AM)',
      });
    }

    let endMinutes = null;

    if (endTime) {
      endMinutes = parseTime(endTime);

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

    /* WORK */

    if (!workType || !String(workType).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Work type is required',
      });
    }

    /* LABOURER */

    const labourer = await Labourer.findOne({ _id: labourerId, isActive: true });

    if (!labourer) {
      return res.status(404).json({
        success: false,
        message: 'Labourer not found or unavailable',
      });
    }

    if (String(labourer.user) === String(farmerId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot book your own labour profile',
      });
    }

    if (labourer.availability !== 'available') {
      return res.status(409).json({
        success: false,
        message: 'This labourer is currently unavailable',
      });
    }

    const availableFrom = toIndianDay(labourer.availableFrom);
    const availableUntil = toIndianDay(labourer.availableUntil);

    if (
      (availableFrom && startDate < availableFrom) ||
      (availableUntil && endDate > availableUntil)
    ) {
      return res.status(409).json({
        success: false,
        message: 'This labourer is not available for the selected dates',
      });
    }

    /* WAGE */

    const finalWageType = wageType || labourer.wageType || 'daily';

    if (!WAGE_TYPES.includes(finalWageType)) {
      return res.status(400).json({
        success: false,
        message: `Wage type must be one of: ${WAGE_TYPES.join(', ')}`,
      });
    }

    const finalWage = parseNumber(wage) ?? Number(labourer.expectedWage || 0);

    if (!Number.isFinite(finalWage) || finalWage <= 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid wage is required',
      });
    }

    if (finalWageType === 'hourly' && endMinutes === null) {
      return res.status(400).json({
        success: false,
        message: 'End time is required for hourly wages',
      });
    }

    const hoursPerDay = endMinutes === null ? 0 : (endMinutes - startMinutes) / 60;

    /* CONFLICTS */

    const [existingBooking, labourerBooked] = await Promise.all([
      LabourBooking.findOne({
        farmer: farmerId,
        labourer: labourerId,
        status: { $in: ACTIVE_STATUSES },
        ...overlapFilter(startDate, endDate),
      }),

      LabourBooking.exists({
        labourer: labourerId,
        status: { $in: ACCEPTED_STATUSES },
        ...overlapFilter(startDate, endDate),
      }),
    ]);

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: 'You already have a booking with this labourer for these dates',
        booking: existingBooking,
      });
    }

    if (labourerBooked) {
      return res.status(409).json({
        success: false,
        message: 'This labourer is already booked on these dates',
      });
    }

    /*
     * Work happens at the farmer's place, so the location defaults to
     * the farmer's profile.
     */
    const farmer = await User.findById(farmerId).select('state district village');

    const booking = await LabourBooking.create({
      farmer: farmerId,
      labourer: labourerId,
      bookingDate: startDate,
      numberOfDays,
      endDate,
      startTime: String(startTime).trim(),
      endTime: endTime ? String(endTime).trim() : '',
      workType: trimText(workType, 100),
      description: trimText(description, 1000),
      state: trimText(state, 100) || farmer?.state || '',
      district: trimText(district, 100) || farmer?.district || '',
      village: trimText(village, 100) || farmer?.village || '',
      address: trimText(address, 300),
      wage: roundMoney(finalWage),
      wageType: finalWageType,
      totalAmount: calculateTotal({
        wage: finalWage,
        wageType: finalWageType,
        numberOfDays,
        hoursPerDay,
      }),
      farmerNotes: trimText(farmerNotes),
      status: 'pending',
    });

    return respondWithBooking(
      res,
      booking._id,
      farmerId,
      201,
      'Labour booking created successfully'
    );
  } catch (error) {
    console.error('Create labour booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create labour booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY BOOKINGS (FARMER)
|--------------------------------------------------------------------------
|
| GET /api/labour-bookings/my-bookings?status=active|pending|accepted|...|all
|
*/

export const getMyBookings = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);

    if (!farmerId || !isValidObjectId(farmerId)) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    await expireStaleRequests();

    const filters = { farmer: farmerId };

    const status = statusFilter(req.query.status);
    if (status) filters.status = status;

    const { currentPage, perPage, skip } = paginate(req.query);

    const [bookings, total] = await Promise.all([
      populateBooking(LabourBooking.find(filters))
        .sort({ bookingDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),

      LabourBooking.countDocuments(filters),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Bookings fetched successfully',
      count: bookings.length,
      total,
      pagination: paginationInfo(currentPage, perPage, total),
      bookings: bookings.map((booking) => formatBooking(booking, farmerId)),
    });
  } catch (error) {
    console.error('Get my bookings error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET LABOURER REQUESTS (LABOURER)
|--------------------------------------------------------------------------
|
| GET /api/labour-bookings/requests?status=active|pending|accepted|...|all
|
*/

export const getLabourerRequests = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const labourer = await Labourer.findOne({ user: userId }).select('_id');

    if (!labourer) {
      return res.status(404).json({
        success: false,
        message: 'Labourer profile not found',
      });
    }

    await expireStaleRequests();

    const filters = { labourer: labourer._id };

    const status = statusFilter(req.query.status);
    if (status) filters.status = status;

    const { currentPage, perPage, skip } = paginate(req.query);

    const [bookings, total] = await Promise.all([
      populateBooking(LabourBooking.find(filters))
        .sort({ bookingDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),

      LabourBooking.countDocuments(filters),
    ]);

    return res.status(200).json({
      success: true,
      count: bookings.length,
      total,
      pagination: paginationInfo(currentPage, perPage, total),
      bookings: bookings.map((booking) => formatBooking(booking, userId)),
    });
  } catch (error) {
    console.error('Get labourer requests error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch labour requests',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET BOOKING BY ID (FARMER OR LABOURER)
|--------------------------------------------------------------------------
*/

export const getBookingById = async (req, res) => {
  try {
    await expireStaleRequests();

    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    return respondWithBooking(res, loaded.booking._id, loaded.userId, 200, 'Booking fetched');
  } catch (error) {
    console.error('Get booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACCEPT BOOKING (LABOURER)
|--------------------------------------------------------------------------
|
| A labourer can't hold two accepted bookings on the same day. Other
| pending requests for the same dates are declined automatically.
|
*/

export const acceptBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    if (role !== 'labourer') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to accept this booking',
      });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`,
      });
    }

    if (booking.bookingDate < todayInIndia()) {
      await expireStaleRequests();

      return res.status(400).json({
        success: false,
        message: 'This request has expired because the work date has passed',
      });
    }

    const labourerId = booking.labourer._id;
    const start = booking.bookingDate;
    const end = bookingEnd(booking);

    const alreadyBooked = await LabourBooking.exists({
      _id: { $ne: booking._id },
      labourer: labourerId,
      status: { $in: ACCEPTED_STATUSES },
      ...overlapFilter(start, end),
    });

    if (alreadyBooked) {
      return res.status(409).json({
        success: false,
        message: 'You already have accepted work on these dates',
      });
    }

    const acceptedAt = new Date();

    const updated = await LabourBooking.findOneAndUpdate(
      { _id: booking._id, status: 'pending' },
      { $set: { status: 'accepted', acceptedAt } },
      { returnDocument: 'after' }
    );

    if (!updated) return staleBookingResponse(res);

    /*
     * Two requests for the same day accepted at the same moment: the one
     * accepted first keeps it, the other goes back to pending.
     */
    const conflict = await LabourBooking.exists({
      _id: { $ne: booking._id },
      labourer: labourerId,
      status: { $in: ACCEPTED_STATUSES },
      ...overlapFilter(start, end),
      $and: [
        {
          $or: [
            { acceptedAt: { $lt: acceptedAt } },
            { acceptedAt, _id: { $lt: booking._id } },
            { acceptedAt: null },
          ],
        },
      ],
    });

    if (conflict) {
      await LabourBooking.updateOne(
        { _id: booking._id, status: 'accepted' },
        { $set: { status: 'pending', acceptedAt: null } }
      );

      return res.status(409).json({
        success: false,
        message: 'You already have accepted work on these dates',
      });
    }

    await LabourBooking.updateMany(
      {
        _id: { $ne: booking._id },
        labourer: labourerId,
        status: 'pending',
        ...overlapFilter(start, end),
      },
      {
        $set: {
          status: 'rejected',
          rejectionReason: 'Labourer is already booked for these dates',
        },
      }
    );

    return respondWithBooking(
      res,
      booking._id,
      userId,
      200,
      'Booking accepted successfully. You can now see each other’s phone numbers.'
    );
  } catch (error) {
    console.error('Accept booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to accept booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| REJECT BOOKING (LABOURER)
|--------------------------------------------------------------------------
*/

export const rejectBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    if (role !== 'labourer') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reject this booking',
      });
    }

    const updated = await LabourBooking.findOneAndUpdate(
      { _id: booking._id, status: 'pending' },
      { $set: { status: 'rejected', rejectionReason: trimText(req.body?.reason) } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`,
      });
    }

    return respondWithBooking(res, booking._id, userId, 200, 'Booking rejected successfully');
  } catch (error) {
    console.error('Reject booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to reject booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| CANCEL BOOKING
|--------------------------------------------------------------------------
|
| Farmer: pending or accepted bookings.
| Labourer: accepted bookings (use reject for pending requests).
|
*/

export const cancelBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    const cancellable = role === 'farmer' ? ACTIVE_STATUSES : ACCEPTED_STATUSES;

    if (!cancellable.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message:
          role === 'labourer' && booking.status === 'pending'
            ? 'Use reject to decline a pending request'
            : `Booking cannot be cancelled because it is already ${booking.status}`,
      });
    }

    const updated = await LabourBooking.findOneAndUpdate(
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

    return respondWithBooking(res, booking._id, userId, 200, 'Booking cancelled successfully');
  } catch (error) {
    console.error('Cancel booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| COMPLETE BOOKING (FARMER OR LABOURER)
|--------------------------------------------------------------------------
|
| Allowed once the work has started (on or after the booking date).
|
*/

export const completeBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, userId } = loaded;

    if (!ACCEPTED_STATUSES.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only accepted bookings can be completed',
      });
    }

    if (booking.bookingDate > todayInIndia()) {
      return res.status(400).json({
        success: false,
        message: 'A booking can be completed only after the work has started',
      });
    }

    const updated = await LabourBooking.findOneAndUpdate(
      { _id: booking._id, status: { $in: ACCEPTED_STATUSES } },
      { $set: { status: 'completed', completedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!updated) return staleBookingResponse(res);

    await Labourer.updateOne({ _id: booking.labourer._id }, { $inc: { totalJobsCompleted: 1 } });

    return respondWithBooking(res, booking._id, userId, 200, 'Booking completed successfully');
  } catch (error) {
    console.error('Complete booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to complete booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| REVIEW LABOURER (FARMER)
|--------------------------------------------------------------------------
|
| POST /api/labour-bookings/:id/review   { "rating": 1-5, "comment": "..." }
|
| One review per completed booking. Updates the labourer's rating.
|
*/

export const reviewBooking = async (req, res) => {
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

    const updated = await LabourBooking.findOneAndUpdate(
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

    await refreshLabourerRating(booking.labourer._id);

    return respondWithBooking(res, booking._id, userId, 200, 'Thank you for your review');
  } catch (error) {
    console.error('Review booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: error.message,
    });
  }
};
