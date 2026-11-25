import crypto from 'crypto';
import mongoose from 'mongoose';

import DeliveryBooking from '../models/DeliveryBooking.js';
import DeliveryPartner from '../models/DeliveryPartner.js';
import User from '../models/User.js';

import {
  PAYMENT_METHODS,
  getVehicle,
  MIN_DISTANCE_KM,
  MAX_DISTANCE_KM,
  MIN_SCHEDULE_LEAD_MINUTES,
  MAX_SCHEDULE_DAYS,
  REACH_PICKUP_MINUTES,
  LOADING_MINUTES,
  ROAD_FACTOR,
} from '../data/deliveryOptions.js';

import {
  ACTIVE_STATUSES,
  ON_TRIP_STATUSES,
  expireStaleDeliveryRequests,
  findCurrentTrip,
  findOverlappingTrip,
  minutesFromNow,
} from '../services/deliveryTripService.js';

import { haversineKm, parsePoint, roundKm } from '../utils/geo.js';

const PARTNER_FIELDS =
  'user fullName phoneNumber profileImage vehicleType vehicleName vehicleNumber capacityKg district village state rating totalReviews totalTrips isOnline location lastLocationAt';

const CUSTOMER_FIELDS = 'fullName phoneNumber village taluka district state';

// Statuses after which phone numbers are shared.
const CONTACT_STATUSES = [...ON_TRIP_STATUSES, 'delivered'];

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const isValidObjectId = (id) => id && mongoose.Types.ObjectId.isValid(id);

const getUserId = (req) => req.user?.userId;

const trimText = (value, max = 500) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const roundMoney = (value) => Math.round(value * 100) / 100;

const sameDistrict = (a, b) =>
  !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

const generateOtp = () => String(crypto.randomInt(1000, 10000));

/*
 * Request body stop -> clean stop, or {error}.
 */
const parseStop = (value, label, { requireDistrict }) => {
  const stop = value && typeof value === 'object' ? value : {};
  const point = parsePoint(stop);

  const clean = {
    address: trimText(stop.address, 300),
    village: trimText(stop.village, 100),
    district: trimText(stop.district, 100),
    state: trimText(stop.state, 100),
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    contactName: trimText(stop.contactName, 100),
    contactPhone: trimText(stop.contactPhone, 20),
  };

  if (!clean.address && !clean.village) {
    return { error: `Enter the ${label} address or village` };
  }

  if (requireDistrict && !clean.district) {
    return { error: `Enter the ${label} district` };
  }

  if (clean.contactPhone && !/^\+?[0-9\s-]{10,15}$/.test(clean.contactPhone)) {
    return { error: `Enter a valid ${label} contact phone number` };
  }

  return { stop: clean };
};

/*
 * Driving time from pickup to drop in minutes, plus loading/unloading.
 */
const tripMinutes = (distanceKm, vehicleType) => {
  const { speedKmph } = getVehicle(vehicleType);
  return Math.round((distanceKm / speedKmph) * 60) + LOADING_MINUTES;
};

/*
 * fare = max(minFare, baseFare + perKmRate x km)
 */
const calculateFare = (partner, distanceKm) => {
  const baseFare = roundMoney(partner.baseFare || 0);
  const perKmRate = roundMoney(partner.perKmRate || 0);
  const distanceFare = roundMoney(perKmRate * distanceKm);
  const minFare = roundMoney(partner.minFare || 0);

  return {
    baseFare,
    perKmRate,
    distanceFare,
    minFare,
    totalAmount: roundMoney(Math.max(minFare, baseFare + distanceFare)),
  };
};

/*
 * Validates a booking request against a partner and works out distance,
 * fare and ETA. Used by both /quote and create.
 *
 * Returns { error, status } or { quote }.
 */
const buildQuote = async (body, { partner, customerId }) => {
  if (String(partner.user) === String(customerId)) {
    return { status: 400, error: 'You cannot book yourself' };
  }

  const pickupResult = parseStop(body.pickup, 'pickup', { requireDistrict: true });
  if (pickupResult.error) return { status: 400, error: pickupResult.error };

  const dropResult = parseStop(body.drop, 'drop', { requireDistrict: false });
  if (dropResult.error) return { status: 400, error: dropResult.error };

  const pickup = pickupResult.stop;
  const drop = dropResult.stop;

  /* DISTRICT RULE */

  if (!sameDistrict(partner.district, pickup.district)) {
    return {
      status: 403,
      error: `${partner.fullName} serves ${partner.district}. You can only book drivers registered in your pickup district (${pickup.district}).`,
    };
  }

  /* DISTANCE */

  let distanceKm;
  let distanceSource = 'manual';

  if (pickup.lat !== null && drop.lat !== null) {
    distanceKm = roundKm(
      haversineKm({ lat: pickup.lat, lng: pickup.lng }, { lat: drop.lat, lng: drop.lng }) *
        ROAD_FACTOR
    );
    distanceSource = 'gps';
  } else {
    distanceKm = parseNumber(body.distanceKm);

    if (!Number.isFinite(distanceKm)) {
      return { status: 400, error: 'Enter the approximate distance in km' };
    }

    distanceKm = roundKm(distanceKm);
  }

  distanceKm = Math.max(distanceKm, MIN_DISTANCE_KM);

  if (distanceKm > MAX_DISTANCE_KM) {
    return { status: 400, error: `Distance must be at most ${MAX_DISTANCE_KM} km` };
  }

  /* GOODS */

  const goodsType = trimText(body.goodsType, 100);
  if (!goodsType) return { status: 400, error: 'Choose what you are sending' };

  const weightKg = parseNumber(body.weightKg) ?? 0;

  if (!Number.isFinite(weightKg) || weightKg < 0) {
    return { status: 400, error: 'Weight must be a positive number' };
  }

  if (weightKg > partner.capacityKg) {
    return {
      status: 400,
      error: `This vehicle carries up to ${partner.capacityKg} kg. Choose a bigger vehicle for ${weightKg} kg.`,
    };
  }

  /* SCHEDULE */

  const scheduleType = body.scheduleType === 'scheduled' ? 'scheduled' : 'now';
  const durationMinutes = tripMinutes(distanceKm, partner.vehicleType);

  let pickupAt;

  if (scheduleType === 'now') {
    if (!partner.isOnline) {
      return {
        status: 409,
        error: `${partner.fullName} is offline right now. Schedule the pickup for later instead.`,
      };
    }

    const currentTrip = await findCurrentTrip(partner._id);

    if (currentTrip) {
      return {
        status: 409,
        error: `${partner.fullName} is on another delivery right now. Schedule the pickup for after ${new Date(
          currentTrip.estimatedDeliveryAt
        ).toLocaleTimeString('en-IN', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        })}.`,
      };
    }

    pickupAt = minutesFromNow(REACH_PICKUP_MINUTES);
  } else {
    pickupAt = new Date(body.pickupAt);

    if (Number.isNaN(pickupAt.getTime())) {
      return { status: 400, error: 'Choose a valid pickup date and time' };
    }

    if (pickupAt < minutesFromNow(MIN_SCHEDULE_LEAD_MINUTES - 1)) {
      return {
        status: 400,
        error: `Scheduled pickups must be at least ${MIN_SCHEDULE_LEAD_MINUTES} minutes from now`,
      };
    }

    if (pickupAt > minutesFromNow(MAX_SCHEDULE_DAYS * 24 * 60)) {
      return {
        status: 400,
        error: `You can schedule up to ${MAX_SCHEDULE_DAYS} days ahead`,
      };
    }
  }

  const estimatedDeliveryAt = new Date(pickupAt.getTime() + durationMinutes * 60 * 1000);

  if (scheduleType === 'scheduled') {
    const clash = await findOverlappingTrip(partner._id, pickupAt, estimatedDeliveryAt);

    if (clash) {
      return {
        status: 409,
        error: `${partner.fullName} is already booked from ${new Date(
          clash.pickupAt
        ).toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Kolkata',
        })} until ${new Date(clash.estimatedDeliveryAt).toLocaleTimeString('en-IN', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        })}. Pick another time.`,
      };
    }
  }

  const paymentMethod = PAYMENT_METHODS.includes(body.paymentMethod) ? body.paymentMethod : 'cod';

  return {
    quote: {
      pickup,
      drop,
      distanceKm,
      distanceSource,
      goodsType,
      weightKg,
      description: trimText(body.description, 500),
      scheduleType,
      pickupAt,
      estimatedDurationMinutes: durationMinutes,
      estimatedDeliveryAt,
      vehicleType: partner.vehicleType,
      ...calculateFare(partner, distanceKm),
      paymentMethod,
      customerNotes: trimText(body.customerNotes, 500),
    },
  };
};

const getRole = (booking, userId) => {
  if (String(booking.customer?._id || booking.customer) === String(userId)) return 'customer';

  const partnerUser = String(booking.partner?.user || '');
  if (partnerUser && partnerUser === String(userId)) return 'partner';

  return null;
};

/*
 * Actions the current user can take. The app shows exactly these.
 */
const availableActions = (booking, role) => {
  const actions = [];

  if (role === 'customer') {
    if (['requested', 'accepted', 'arrived'].includes(booking.status)) actions.push('cancel');
    if (booking.status === 'delivered' && !booking.review?.rating) actions.push('review');
  }

  if (role === 'partner') {
    if (booking.status === 'requested') actions.push('reject', 'accept');
    if (booking.status === 'accepted') actions.push('cancel', 'arrived');
    if (booking.status === 'arrived') actions.push('cancel', 'picked_up');
    if (booking.status === 'picked_up') actions.push('deliver');
  }

  return actions;
};

/*
 * Shapes a booking for the current user:
 *  - phone numbers only after the driver accepts
 *  - the delivery OTP only for the customer, while the trip is on
 *  - the driver's live location only for the customer, while on trip
 */
const formatBooking = (booking, userId) => {
  const plain = typeof booking.toObject === 'function' ? booking.toObject() : { ...booking };
  const role = getRole(plain, userId);
  const shareContact = CONTACT_STATUSES.includes(plain.status);
  const onTrip = ON_TRIP_STATUSES.includes(plain.status);

  const partner =
    plain.partner && typeof plain.partner === 'object' ? { ...plain.partner } : plain.partner;
  const customer =
    plain.customer && typeof plain.customer === 'object' ? { ...plain.customer } : plain.customer;

  let partnerLocation = null;

  if (partner && typeof partner === 'object') {
    if (role === 'customer' && onTrip && parsePoint(partner.location)) {
      partnerLocation = { ...partner.location, updatedAt: partner.lastLocationAt };
    }

    delete partner.location;
    delete partner.lastLocationAt;
    if (!shareContact) delete partner.phoneNumber;
  }

  if (customer && typeof customer === 'object' && !shareContact) delete customer.phoneNumber;

  const pickup = { ...plain.pickup };
  const drop = { ...plain.drop };

  if (role === 'partner' && !shareContact) {
    pickup.contactPhone = '';
    drop.contactPhone = '';
  }

  const { deliveryOtp, ...rest } = plain;

  return {
    ...rest,
    pickup,
    drop,
    partner,
    customer,
    myRole: role,
    deliveryOtp: role === 'customer' && onTrip ? deliveryOtp || '' : undefined,
    partnerLocation,
    actions: availableActions(plain, role),
    canReview: role === 'customer' && plain.status === 'delivered' && !plain.review?.rating,
  };
};

const populateBooking = (query) =>
  query.populate('partner', PARTNER_FIELDS).populate('customer', CUSTOMER_FIELDS);

const respondWithBooking = async (res, bookingId, userId, status, message) => {
  const booking = await populateBooking(
    DeliveryBooking.findById(bookingId).select('+deliveryOtp')
  ).lean();

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
  const userId = getUserId(req);
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    res.status(400).json({ success: false, message: 'Invalid booking ID' });
    return null;
  }

  const booking = await DeliveryBooking.findById(id)
    .select('+deliveryOtp')
    .populate('partner', 'user fullName vehicleType capacityKg');

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

const staleResponse = (res) =>
  res.status(409).json({
    success: false,
    message: 'This booking was just updated. Please refresh and try again.',
  });

const refreshPartnerRating = async (partnerId) => {
  const [stats] = await DeliveryBooking.aggregate([
    {
      $match: {
        partner: new mongoose.Types.ObjectId(String(partnerId)),
        status: 'delivered',
        'review.rating': { $ne: null },
      },
    },
    { $group: { _id: null, average: { $avg: '$review.rating' }, count: { $sum: 1 } } },
  ]);

  await DeliveryPartner.updateOne(
    { _id: partnerId },
    {
      $set: {
        rating: stats ? Math.round(stats.average * 10) / 10 : 0,
        totalReviews: stats ? stats.count : 0,
      },
    }
  );
};

/*
 * status query param -> filter value.
 *   active -> requested + on trip
 *   past   -> delivered, rejected, cancelled
 */
const statusFilter = (status) => {
  if (!status || status === 'all') return undefined;
  if (status === 'active') return { $in: ACTIVE_STATUSES };
  if (status === 'on_trip') return { $in: ON_TRIP_STATUSES };
  if (status === 'past') return { $in: ['delivered', 'rejected', 'cancelled'] };
  return status;
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

const loadBookablePartner = async (partnerId) => {
  if (!isValidObjectId(partnerId)) return { status: 400, error: 'A valid partner ID is required' };

  const partner = await DeliveryPartner.findOne({ _id: partnerId, isActive: true }).lean();

  if (!partner) return { status: 404, error: 'Delivery partner not found or unavailable' };

  return { partner };
};

/*
|--------------------------------------------------------------------------
| QUOTE
|--------------------------------------------------------------------------
|
| POST /api/delivery/bookings/quote   (same body as create)
|
| Checks the request and returns distance, fare and ETA without booking.
|
*/

export const getDeliveryQuote = async (req, res) => {
  try {
    const customerId = getUserId(req);

    await expireStaleDeliveryRequests();

    const { partner, status, error } = await loadBookablePartner(req.body?.partnerId);
    if (error) return res.status(status).json({ success: false, message: error });

    const result = await buildQuote(req.body || {}, { partner, customerId });

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    const { pickup, drop, description, customerNotes, ...quote } = result.quote;

    return res.status(200).json({ success: true, quote });
  } catch (error) {
    console.error('Delivery quote error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to calculate the fare',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| CREATE BOOKING
|--------------------------------------------------------------------------
|
| POST /api/delivery/bookings
|
| {
|   "partnerId": "...",
|   "pickup": { "address", "village", "district", "state", "lat", "lng",
|               "contactName", "contactPhone" },
|   "drop":   { ...same },
|   "distanceKm": 12,              // used only when either stop has no lat/lng
|   "goodsType": "Grain / Produce",
|   "weightKg": 400,
|   "description": "...",
|   "scheduleType": "now" | "scheduled",
|   "pickupAt": "2026-11-21T09:30:00+05:30",   // scheduled only
|   "paymentMethod": "cod" | "upi",
|   "customerNotes": "..."
| }
|
*/

export const createDeliveryBooking = async (req, res) => {
  try {
    const customerId = getUserId(req);

    if (!isValidObjectId(customerId)) {
      return res.status(401).json({ success: false, message: 'Authenticated user not found' });
    }

    await expireStaleDeliveryRequests();

    const { partner, status, error } = await loadBookablePartner(req.body?.partnerId);
    if (error) return res.status(status).json({ success: false, message: error });

    const existing = await DeliveryBooking.findOne({
      customer: customerId,
      partner: partner._id,
      status: { $in: ACTIVE_STATUSES },
    }).select('_id');

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'You already have an open booking with this driver',
        booking: existing,
      });
    }

    const result = await buildQuote(req.body || {}, { partner, customerId });

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    /*
     * Default the pickup contact to the customer.
     */
    const customer = await User.findById(customerId).select('fullName phoneNumber').lean();
    const { quote } = result;

    if (!quote.pickup.contactName) quote.pickup.contactName = customer?.fullName || '';
    if (!quote.pickup.contactPhone) quote.pickup.contactPhone = customer?.phoneNumber || '';

    const booking = await DeliveryBooking.create({
      ...quote,
      customer: customerId,
      partner: partner._id,
      status: 'requested',
    });

    return respondWithBooking(
      res,
      booking._id,
      customerId,
      201,
      quote.scheduleType === 'now'
        ? 'Request sent. Waiting for the driver to accept.'
        : 'Scheduled request sent to the driver.'
    );
  } catch (error) {
    console.error('Create delivery booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create the delivery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| LISTS
|--------------------------------------------------------------------------
|
| GET /api/delivery/bookings/my-bookings?status=active|past|all|<status>
| GET /api/delivery/bookings/requests?status=...   (driver)
|
*/

const listBookings = async (req, res, filters, userId) => {
  const status = statusFilter(req.query.status);
  if (status) filters.status = status;

  const { currentPage, perPage, skip } = paginate(req.query);

  const [bookings, total] = await Promise.all([
    populateBooking(DeliveryBooking.find(filters).select('+deliveryOtp'))
      .sort({ pickupAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .lean(),

    DeliveryBooking.countDocuments(filters),
  ]);

  return res.status(200).json({
    success: true,
    count: bookings.length,
    total,
    pagination: paginationInfo(currentPage, perPage, total),
    bookings: bookings.map((booking) => formatBooking(booking, userId)),
  });
};

export const getMyDeliveryBookings = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!isValidObjectId(userId)) {
      return res.status(401).json({ success: false, message: 'Authenticated user not found' });
    }

    await expireStaleDeliveryRequests();

    return listBookings(req, res, { customer: userId }, userId);
  } catch (error) {
    console.error('Get my delivery bookings error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your deliveries',
      error: error.message,
    });
  }
};

export const getPartnerRequests = async (req, res) => {
  try {
    const userId = getUserId(req);
    const partner = await DeliveryPartner.findOne({ user: userId }).select('_id');

    if (!partner) {
      return res
        .status(404)
        .json({ success: false, message: 'Delivery partner profile not found' });
    }

    await expireStaleDeliveryRequests();

    return listBookings(req, res, { partner: partner._id }, userId);
  } catch (error) {
    console.error('Get delivery requests error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery requests',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET BOOKING BY ID
|--------------------------------------------------------------------------
*/

export const getDeliveryBookingById = async (req, res) => {
  try {
    await expireStaleDeliveryRequests();

    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    return respondWithBooking(res, loaded.booking._id, loaded.userId, 200, 'Booking fetched');
  } catch (error) {
    console.error('Get delivery booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACCEPT (DRIVER)
|--------------------------------------------------------------------------
|
| "Book now": the driver can't be on another trip. The pickup ETA starts
| from the moment of accepting, and other "book now" requests are
| declined.
|
| Scheduled: the trip window must not overlap another accepted trip.
| Other requests for an overlapping window are declined.
|
*/

export const acceptDeliveryBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    if (role !== 'partner') {
      return res.status(403).json({ success: false, message: 'Only the driver can accept' });
    }

    await expireStaleDeliveryRequests();

    const fresh = await DeliveryBooking.findById(booking._id).select('status');

    if (fresh.status !== 'requested') {
      return res.status(400).json({
        success: false,
        message:
          fresh.status === 'cancelled'
            ? 'This request was cancelled or has expired'
            : `Booking is already ${fresh.status.replace('_', ' ')}`,
      });
    }

    const partnerId = booking.partner._id;
    let pickupAt = booking.pickupAt;
    let estimatedDeliveryAt = booking.estimatedDeliveryAt;

    if (booking.scheduleType === 'now') {
      const currentTrip = await findCurrentTrip(partnerId, booking._id);

      if (currentTrip) {
        return res.status(409).json({
          success: false,
          message: 'Finish your current delivery before accepting a new one',
        });
      }

      pickupAt = minutesFromNow(REACH_PICKUP_MINUTES);
      estimatedDeliveryAt = new Date(
        pickupAt.getTime() + booking.estimatedDurationMinutes * 60 * 1000
      );
    }

    const clash = await findOverlappingTrip(partnerId, pickupAt, estimatedDeliveryAt, booking._id);

    if (clash) {
      return res.status(409).json({
        success: false,
        message: 'You already have an accepted trip at this time',
      });
    }

    const acceptedAt = new Date();

    const updated = await DeliveryBooking.findOneAndUpdate(
      { _id: booking._id, status: 'requested' },
      {
        $set: {
          status: 'accepted',
          acceptedAt,
          pickupAt,
          estimatedDeliveryAt,
          deliveryOtp: generateOtp(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) return staleResponse(res);

    /*
     * Two requests accepted at the same moment: the earlier acceptance
     * keeps its slot, this one goes back to requested.
     */
    const conflict = await DeliveryBooking.exists({
      _id: { $ne: booking._id },
      partner: partnerId,
      status: { $in: ON_TRIP_STATUSES },
      pickupAt: { $lt: estimatedDeliveryAt },
      estimatedDeliveryAt: { $gt: pickupAt },
      $or: [{ acceptedAt: { $lt: acceptedAt } }, { acceptedAt, _id: { $lt: booking._id } }],
    });

    if (conflict) {
      await DeliveryBooking.updateOne(
        { _id: booking._id, status: 'accepted' },
        {
          $set: {
            status: 'requested',
            acceptedAt: null,
            pickupAt: booking.pickupAt,
            estimatedDeliveryAt: booking.estimatedDeliveryAt,
            deliveryOtp: '',
          },
        }
      );

      return res.status(409).json({
        success: false,
        message: 'You already have an accepted trip at this time',
      });
    }

    await DeliveryBooking.updateMany(
      {
        _id: { $ne: booking._id },
        partner: partnerId,
        status: 'requested',
        $or: [
          ...(booking.scheduleType === 'now' ? [{ scheduleType: 'now' }] : []),
          { pickupAt: { $lt: estimatedDeliveryAt }, estimatedDeliveryAt: { $gt: pickupAt } },
        ],
      },
      { $set: { status: 'rejected', rejectionReason: 'The driver took another trip at this time' } }
    );

    return respondWithBooking(
      res,
      booking._id,
      userId,
      200,
      'Trip accepted. Head to the pickup. Phone numbers are now shared.'
    );
  } catch (error) {
    console.error('Accept delivery booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to accept the booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| REJECT (DRIVER)
|--------------------------------------------------------------------------
*/

export const rejectDeliveryBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    if (role !== 'partner') {
      return res.status(403).json({ success: false, message: 'Only the driver can decline' });
    }

    const updated = await DeliveryBooking.findOneAndUpdate(
      { _id: booking._id, status: 'requested' },
      { $set: { status: 'rejected', rejectionReason: trimText(req.body?.reason) } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status.replace('_', ' ')}`,
      });
    }

    return respondWithBooking(res, booking._id, userId, 200, 'Request declined');
  } catch (error) {
    console.error('Reject delivery booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to decline the booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| CANCEL
|--------------------------------------------------------------------------
|
| Customer: until the goods are picked up.
| Driver:   accepted / arrived (use reject for new requests).
|
*/

export const cancelDeliveryBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    const cancellable =
      role === 'customer' ? ['requested', 'accepted', 'arrived'] : ['accepted', 'arrived'];

    if (!cancellable.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message:
          role === 'partner' && booking.status === 'requested'
            ? 'Use decline for a new request'
            : booking.status === 'picked_up'
              ? 'Goods are already picked up. The trip can only be completed now.'
              : `Booking cannot be cancelled because it is ${booking.status.replace('_', ' ')}`,
      });
    }

    const updated = await DeliveryBooking.findOneAndUpdate(
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

    if (!updated) return staleResponse(res);

    return respondWithBooking(res, booking._id, userId, 200, 'Booking cancelled');
  } catch (error) {
    console.error('Cancel delivery booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to cancel the booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| TRIP PROGRESS (DRIVER)
|--------------------------------------------------------------------------
|
| PATCH /:id/arrived     accepted  -> arrived
| PATCH /:id/picked-up   arrived   -> picked_up  (ETA restarts from now)
| PATCH /:id/deliver     picked_up -> delivered  { "otp": "1234" }
|
*/

const advanceTrip = async (req, res, { from, to, extra = () => ({}), message, check }) => {
  const loaded = await loadBookingForUser(req, res);
  if (!loaded) return;

  const { booking, role, userId } = loaded;

  if (role !== 'partner') {
    return res.status(403).json({ success: false, message: 'Only the driver can update the trip' });
  }

  if (booking.status !== from) {
    return res.status(400).json({
      success: false,
      message: `Trip is ${booking.status.replace('_', ' ')}, it can't be marked ${to.replace('_', ' ')}`,
    });
  }

  if (check) {
    const problem = check(booking);
    if (problem) return res.status(400).json({ success: false, message: problem });
  }

  const updated = await DeliveryBooking.findOneAndUpdate(
    { _id: booking._id, status: from },
    { $set: { status: to, ...extra(booking) } },
    { returnDocument: 'after' }
  );

  if (!updated) return staleResponse(res);

  if (to === 'delivered') {
    await DeliveryPartner.updateOne({ _id: booking.partner._id }, { $inc: { totalTrips: 1 } });
  }

  return respondWithBooking(res, booking._id, userId, 200, message);
};

export const markArrived = async (req, res) => {
  try {
    return await advanceTrip(req, res, {
      from: 'accepted',
      to: 'arrived',
      extra: () => ({ arrivedAt: new Date() }),
      message: 'Marked as arrived at pickup',
    });
  } catch (error) {
    console.error('Mark arrived error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update the trip' });
  }
};

export const markPickedUp = async (req, res) => {
  try {
    return await advanceTrip(req, res, {
      from: 'arrived',
      to: 'picked_up',
      extra: (booking) => {
        const now = new Date();
        const driveMinutes = Math.max(
          booking.estimatedDurationMinutes - Math.round(LOADING_MINUTES / 2),
          5
        );

        return {
          pickedUpAt: now,
          estimatedDeliveryAt: new Date(now.getTime() + driveMinutes * 60 * 1000),
        };
      },
      message: 'Goods picked up. Drive safe!',
    });
  } catch (error) {
    console.error('Mark picked up error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update the trip' });
  }
};

export const markDelivered = async (req, res) => {
  try {
    const otp = String(req.body?.otp || '').trim();

    return await advanceTrip(req, res, {
      from: 'picked_up',
      to: 'delivered',
      check: (booking) =>
        !otp
          ? 'Ask the customer for the 4-digit delivery OTP'
          : otp !== booking.deliveryOtp
            ? 'Wrong OTP. Ask the customer to check the code in their app.'
            : null,
      extra: () => ({ deliveredAt: new Date() }),
      message: 'Delivered! Collect the payment if it is cash.',
    });
  } catch (error) {
    console.error('Mark delivered error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update the trip' });
  }
};

/*
|--------------------------------------------------------------------------
| REVIEW (CUSTOMER)
|--------------------------------------------------------------------------
*/

export const reviewDeliveryBooking = async (req, res) => {
  try {
    const loaded = await loadBookingForUser(req, res);
    if (!loaded) return;

    const { booking, role, userId } = loaded;

    if (role !== 'customer') {
      return res
        .status(403)
        .json({ success: false, message: 'Only the customer can rate the trip' });
    }

    const rating = Number(req.body?.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be from 1 to 5' });
    }

    const updated = await DeliveryBooking.findOneAndUpdate(
      { _id: booking._id, status: 'delivered', 'review.rating': null },
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
          booking.status !== 'delivered'
            ? 'You can rate only after delivery'
            : 'You have already rated this trip',
      });
    }

    await refreshPartnerRating(booking.partner._id);

    return respondWithBooking(res, booking._id, userId, 200, 'Thanks for rating your driver');
  } catch (error) {
    console.error('Review delivery booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to submit rating',
      error: error.message,
    });
  }
};
