import mongoose from 'mongoose';

import DeliveryPartner from '../models/DeliveryPartner.js';
import DeliveryBooking from '../models/DeliveryBooking.js';
import User from '../models/User.js';

import {
  VEHICLE_TYPES,
  VEHICLE_KEYS,
  GOODS_TYPES,
  PAYMENT_METHODS,
  SCHEDULE_TYPES,
  getVehicle,
  MIN_DISTANCE_KM,
  MAX_DISTANCE_KM,
  MIN_SCHEDULE_LEAD_MINUTES,
  MAX_SCHEDULE_DAYS,
  NOW_REQUEST_TIMEOUT_MINUTES,
  REACH_PICKUP_MINUTES,
  LOADING_MINUTES,
  ROAD_FACTOR,
} from '../data/deliveryOptions.js';

import {
  ACTIVE_STATUSES,
  ON_TRIP_STATUSES,
  expireStaleDeliveryRequests,
  findCurrentTrip,
  getPartnerTripInfo,
} from '../services/deliveryTripService.js';

import { haversineKm, parsePoint, roundKm } from '../utils/geo.js';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const isValidObjectId = (id) => id && mongoose.Types.ObjectId.isValid(id);

const getUserId = (req) => req.user?.userId;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactInsensitive = (value) => new RegExp(`^${escapeRegex(value.trim())}$`, 'i');

const containsInsensitive = (value) => new RegExp(escapeRegex(value.trim()), 'i');

const trimString = (value, max = 200) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const roundMoney = (value) => Math.round(value * 100) / 100;

const sameDistrict = (a, b) =>
  !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/*
 * Phone numbers and exact location are never part of the public profile.
 * The phone is shared through a booking once the driver accepts it.
 */
const toPublicPartner = (partner) => {
  const { phoneNumber, location, lastLocationAt, ...rest } = partner;
  return rest;
};

/*
 * Adds the fields the app uses to show and gate a partner card.
 *
 *   inYourDistrict  partner is registered in the customer's district
 *   canBook         customer may send a request (same district, active)
 *   tripState       offline | available | on_trip
 *   distanceKm      from the customer, when both locations are known
 */
const decoratePartner = (partner, { district, origin, tripInfo }) => {
  const trip = tripInfo?.get(String(partner._id)) || {
    currentTrip: null,
    upcomingTrips: 0,
    nextPickupAt: null,
  };

  const partnerPoint = parsePoint(partner.location);
  const inYourDistrict = sameDistrict(partner.district, district);

  return {
    ...toPublicPartner(partner),
    inYourDistrict,
    canBook: inYourDistrict && partner.isActive !== false,
    tripState: trip.currentTrip ? 'on_trip' : partner.isOnline ? 'available' : 'offline',
    currentTrip: trip.currentTrip,
    upcomingTrips: trip.upcomingTrips,
    nextPickupAt: trip.nextPickupAt,
    distanceKm: origin && partnerPoint ? roundKm(haversineKm(origin, partnerPoint)) : null,
  };
};

/*
 * The customer's district for the "in your district" rule: the
 * district query param (where the pickup is), else their profile.
 */
const resolveCustomerDistrict = async (req) => {
  const fromQuery = trimString(req.query?.district, 100);
  if (fromQuery) return fromQuery;

  const user = await User.findById(getUserId(req)).select('district').lean();
  return user?.district || '';
};

/*
 * Validates partner profile fields. On create the required fields must
 * be present; on update only sent fields are checked.
 *
 * Returns { fields } or { error }.
 */
const buildPartnerFields = (body, { isCreate }) => {
  const fields = {};
  const has = (key) => body[key] !== undefined;

  if (isCreate || has('fullName')) {
    const fullName = trimString(body.fullName, 100);
    if (!fullName) return { error: 'Full name is required' };
    fields.fullName = fullName;
  }

  if (isCreate || has('phoneNumber')) {
    const phoneNumber = trimString(body.phoneNumber, 20);

    if (!/^\+?[0-9\s-]{10,15}$/.test(phoneNumber)) {
      return { error: 'A valid phone number is required so customers can reach you' };
    }

    fields.phoneNumber = phoneNumber;
  }

  if (has('profileImage')) fields.profileImage = trimString(body.profileImage, 500);
  if (has('about')) fields.about = trimString(body.about, 300);

  if (has('languages')) {
    if (!Array.isArray(body.languages) || body.languages.some((item) => typeof item !== 'string')) {
      return { error: 'Languages must be a list of text values' };
    }

    fields.languages = [
      ...new Set(body.languages.map((item) => item.trim()).filter(Boolean)),
    ].slice(0, 10);
  }

  if (isCreate || has('vehicleType')) {
    if (!VEHICLE_KEYS.includes(body.vehicleType)) {
      return { error: `Vehicle type must be one of: ${VEHICLE_KEYS.join(', ')}` };
    }

    fields.vehicleType = body.vehicleType;
  }

  if (has('vehicleName')) fields.vehicleName = trimString(body.vehicleName, 80);

  if (isCreate || has('vehicleNumber')) {
    const vehicleNumber = trimString(body.vehicleNumber, 20).toUpperCase();

    if (!/^[A-Z0-9\s-]{4,20}$/.test(vehicleNumber)) {
      return { error: 'Enter a valid vehicle registration number' };
    }

    fields.vehicleNumber = vehicleNumber;
  }

  const defaults = getVehicle(fields.vehicleType || body.vehicleType);

  const numberField = (key, label, { min = 0, max = 100000, fallback }) => {
    if (!isCreate && !has(key)) return null;

    const value = parseNumber(body[key]) ?? fallback;

    if (!Number.isFinite(value) || value < min || value > max) {
      return `${label} must be a number from ${min} to ${max}`;
    }

    fields[key] = roundMoney(value);
    return null;
  };

  const numberError =
    numberField('capacityKg', 'Capacity (kg)', {
      min: 1,
      max: 50000,
      fallback: defaults.capacityKg,
    }) ||
    numberField('baseFare', 'Base fare', { fallback: defaults.baseFare }) ||
    numberField('perKmRate', 'Rate per km', { max: 1000, fallback: defaults.perKmRate }) ||
    numberField('minFare', 'Minimum fare', { fallback: defaults.minFare });

  if (numberError) return { error: numberError };

  if (isCreate || has('district')) {
    const district = trimString(body.district, 100);
    if (!district) return { error: 'District is required so nearby customers can find you' };
    fields.district = district;
  }

  for (const key of ['state', 'taluka', 'village']) {
    if (has(key)) fields[key] = trimString(body[key], 100);
  }

  if (has('location')) {
    fields.location = parsePoint(body.location);
    fields.lastLocationAt = fields.location ? new Date() : null;
  }

  return { fields };
};

/*
|--------------------------------------------------------------------------
| GET META
|--------------------------------------------------------------------------
*/

export const getDeliveryMeta = async (req, res) => {
  return res.status(200).json({
    success: true,
    vehicleTypes: VEHICLE_TYPES,
    goodsTypes: GOODS_TYPES,
    paymentMethods: PAYMENT_METHODS,
    scheduleTypes: SCHEDULE_TYPES,
    settings: {
      minDistanceKm: MIN_DISTANCE_KM,
      maxDistanceKm: MAX_DISTANCE_KM,
      minScheduleLeadMinutes: MIN_SCHEDULE_LEAD_MINUTES,
      maxScheduleDays: MAX_SCHEDULE_DAYS,
      nowRequestTimeoutMinutes: NOW_REQUEST_TIMEOUT_MINUTES,
      reachPickupMinutes: REACH_PICKUP_MINUTES,
      loadingMinutes: LOADING_MINUTES,
      roadFactor: ROAD_FACTOR,
    },
  });
};

/*
|--------------------------------------------------------------------------
| BROWSE PARTNERS
|--------------------------------------------------------------------------
|
| GET /api/delivery/partners
|
| Every registered partner on the platform is listed. Partners in the
| customer's district come first and are the only ones that can be
| booked (canBook).
|
| Query params (all optional):
|   district      the pickup district (default: the user's profile)
|   scope         all (default) | district
|   search        name, vehicle name / number, village, district
|   vehicleType   bike | auto | mini_truck | pickup | tractor_trolley | truck
|   minCapacity   kg
|   onlineOnly    true -> only partners who are online now
|   lat, lng      customer's location, for distanceKm
|   sort          recommended (default) | rating | price | capacity | newest
|   page, limit
|
*/

export const getAllPartners = async (req, res) => {
  try {
    const userId = getUserId(req);
    await expireStaleDeliveryRequests();

    const {
      search,
      vehicleType,
      minCapacity,
      onlineOnly,
      scope,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    const district = await resolveCustomerDistrict(req);
    const origin = parsePoint({ lat: req.query.lat, lng: req.query.lng });

    const filters = { isActive: true };

    if (isValidObjectId(userId)) {
      filters.user = { $ne: new mongoose.Types.ObjectId(String(userId)) };
    }

    if (scope === 'district') {
      if (!district) {
        return res.status(200).json({
          success: true,
          district: '',
          count: 0,
          total: 0,
          stats: { total: 0, inDistrict: 0, onlineInDistrict: 0 },
          pagination: {
            currentPage: 1,
            limit: 20,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
          partners: [],
        });
      }

      filters.district = exactInsensitive(district);
    }

    if (VEHICLE_KEYS.includes(vehicleType)) filters.vehicleType = vehicleType;

    const capacity = parseNumber(minCapacity);
    if (Number.isFinite(capacity) && capacity > 0) filters.capacityKg = { $gte: capacity };

    if (String(onlineOnly) === 'true') filters.isOnline = true;

    if (search && String(search).trim()) {
      const pattern = containsInsensitive(String(search));

      filters.$or = [
        { fullName: pattern },
        { vehicleName: pattern },
        { vehicleNumber: pattern },
        { village: pattern },
        { district: pattern },
      ];
    }

    const districtLower = district.trim().toLowerCase();

    const sortOptions = {
      recommended: { inDistrict: -1, isOnline: -1, rating: -1, totalTrips: -1, _id: 1 },
      rating: { rating: -1, totalTrips: -1, _id: 1 },
      price: { perKmRate: 1, baseFare: 1, _id: 1 },
      capacity: { capacityKg: -1, _id: 1 },
      newest: { createdAt: -1, _id: 1 },
    };

    const currentPage = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const [partners, total, inDistrict, onlineInDistrict] = await Promise.all([
      DeliveryPartner.aggregate([
        { $match: filters },
        {
          $addFields: {
            inDistrict: districtLower
              ? { $eq: [{ $toLower: { $trim: { input: '$district' } } }, districtLower] }
              : false,
          },
        },
        { $sort: sortOptions[sort] || sortOptions.recommended },
        { $skip: (currentPage - 1) * perPage },
        { $limit: perPage },
        { $project: { inDistrict: 0 } },
      ]),

      DeliveryPartner.countDocuments(filters),

      district
        ? DeliveryPartner.countDocuments({ isActive: true, district: exactInsensitive(district) })
        : 0,

      district
        ? DeliveryPartner.countDocuments({
            isActive: true,
            isOnline: true,
            district: exactInsensitive(district),
          })
        : 0,
    ]);

    const tripInfo = await getPartnerTripInfo(partners.map((partner) => partner._id));
    const totalPages = Math.ceil(total / perPage);

    return res.status(200).json({
      success: true,
      district,
      count: partners.length,
      total,
      stats: {
        total: await DeliveryPartner.countDocuments({ isActive: true }),
        inDistrict,
        onlineInDistrict,
      },
      pagination: {
        currentPage,
        limit: perPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
      partners: partners.map((partner) => decoratePartner(partner, { district, origin, tripInfo })),
    });
  } catch (error) {
    console.error('Get delivery partners error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery partners',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET PARTNER BY ID
|--------------------------------------------------------------------------
|
| Public profile, trip state, recent reviews and the customer's open
| booking with this partner (if any).
|
*/

export const getPartnerById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid partner ID' });
    }

    await expireStaleDeliveryRequests();

    const partner = await DeliveryPartner.findOne({ _id: id, isActive: true }).lean();

    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const isOwner = String(partner.user) === String(userId);
    const district = await resolveCustomerDistrict(req);
    const origin = parsePoint({ lat: req.query.lat, lng: req.query.lng });

    const [tripInfo, reviews, myActiveBooking] = await Promise.all([
      getPartnerTripInfo([partner._id]),

      DeliveryBooking.find({ partner: id, status: 'delivered', 'review.rating': { $ne: null } })
        .select('review goodsType customer')
        .populate('customer', 'fullName village district')
        .sort({ 'review.createdAt': -1 })
        .limit(10)
        .lean(),

      isOwner
        ? null
        : DeliveryBooking.findOne({
            partner: id,
            customer: userId,
            status: { $in: ACTIVE_STATUSES },
          })
            .select('_id status pickupAt goodsType drop.village drop.district')
            .sort({ pickupAt: 1 })
            .lean(),
    ]);

    const decorated = decoratePartner(partner, { district, origin, tripInfo });

    return res.status(200).json({
      success: true,
      partner: {
        ...decorated,
        ...(isOwner && { phoneNumber: partner.phoneNumber }),
        isOwner,
        canBook: decorated.canBook && !isOwner,
        myActiveBooking: myActiveBooking || null,
        recentReviews: reviews.map((booking) => ({
          rating: booking.review.rating,
          comment: booking.review.comment,
          createdAt: booking.review.createdAt,
          goodsType: booking.goodsType,
          customer: booking.customer,
        })),
      },
    });
  } catch (error) {
    console.error('Get delivery partner error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery partner',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| CREATE MY PARTNER PROFILE
|--------------------------------------------------------------------------
*/

export const createPartner = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!isValidObjectId(userId)) {
      return res.status(401).json({ success: false, message: 'Authenticated user not found' });
    }

    const existing = await DeliveryPartner.findOne({ user: userId });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'You are already registered as a delivery partner',
        partner: existing,
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

    const { fields, error } = buildPartnerFields(body, { isCreate: true });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const partner = await DeliveryPartner.create({
      ...fields,
      user: userId,
      isActive: true,
      isOnline: true,
    });

    return res.status(201).json({
      success: true,
      message: 'You are now registered as a delivery partner',
      partner,
    });
  } catch (error) {
    console.error('Create delivery partner error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You are already registered as a delivery partner',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to register as a delivery partner',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY PARTNER PROFILE
|--------------------------------------------------------------------------
|
| Includes pendingRequests, the current trip and today's earnings for
| the driver dashboard.
|
*/

export const getMyPartnerProfile = async (req, res) => {
  try {
    const userId = getUserId(req);

    const partner = await DeliveryPartner.findOne({ user: userId }).lean();

    if (!partner) {
      return res
        .status(404)
        .json({ success: false, message: 'Delivery partner profile not found' });
    }

    await expireStaleDeliveryRequests();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [pendingRequests, upcomingTrips, currentTrip, earnings] = await Promise.all([
      DeliveryBooking.countDocuments({ partner: partner._id, status: 'requested' }),

      DeliveryBooking.countDocuments({ partner: partner._id, status: { $in: ON_TRIP_STATUSES } }),

      findCurrentTrip(partner._id),

      DeliveryBooking.aggregate([
        { $match: { partner: partner._id, status: 'delivered' } },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' },
            today: {
              $sum: { $cond: [{ $gte: ['$deliveredAt', startOfDay] }, '$totalAmount', 0] },
            },
            tripsToday: { $sum: { $cond: [{ $gte: ['$deliveredAt', startOfDay] }, 1, 0] } },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      partner: {
        ...partner,
        pendingRequests,
        upcomingTrips,
        currentTripId: currentTrip?._id || null,
        earnings: {
          total: earnings[0]?.total || 0,
          today: earnings[0]?.today || 0,
          tripsToday: earnings[0]?.tripsToday || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get my delivery partner error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your partner profile',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE MY PARTNER PROFILE
|--------------------------------------------------------------------------
*/

export const updateMyPartnerProfile = async (req, res) => {
  try {
    const userId = getUserId(req);

    const existing = await DeliveryPartner.findOne({ user: userId }).select('_id district');

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: 'Delivery partner profile not found' });
    }

    const { fields, error } = buildPartnerFields(req.body, { isCreate: false });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    /*
     * Customers only book partners from their district, so a partner
     * can't move away while committed to trips there.
     */
    if (fields.district && !sameDistrict(fields.district, existing.district)) {
      const committed = await DeliveryBooking.exists({
        partner: existing._id,
        status: { $in: ACTIVE_STATUSES },
      });

      if (committed) {
        return res.status(409).json({
          success: false,
          message: 'Finish or cancel your open bookings before changing your district',
        });
      }
    }

    const partner = await DeliveryPartner.findOneAndUpdate(
      { user: userId },
      { $set: fields },
      { returnDocument: 'after', runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      partner,
    });
  } catch (error) {
    console.error('Update delivery partner error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update your partner profile',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GO ONLINE / OFFLINE
|--------------------------------------------------------------------------
|
| PATCH /api/delivery/partners/me/online   { "isOnline": true, "location": {lat, lng} }
|
| Going offline keeps accepted trips; it only stops new "book now"
| requests. Pending "book now" requests are declined.
|
*/

export const setMyOnlineStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const isOnline = req.body?.isOnline === true;

    const update = { isOnline };
    const point = parsePoint(req.body?.location);

    if (point) {
      update.location = point;
      update.lastLocationAt = new Date();
    }

    const partner = await DeliveryPartner.findOneAndUpdate(
      { user: userId, isActive: true },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Active delivery partner profile not found',
      });
    }

    if (!isOnline) {
      await DeliveryBooking.updateMany(
        { partner: partner._id, status: 'requested', scheduleType: 'now' },
        { $set: { status: 'rejected', rejectionReason: 'Driver went offline' } }
      );
    }

    return res.status(200).json({
      success: true,
      message: isOnline ? 'You are online. New requests will reach you.' : 'You are offline.',
      partner,
    });
  } catch (error) {
    console.error('Set online status error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update your status',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE MY LOCATION
|--------------------------------------------------------------------------
|
| PATCH /api/delivery/partners/me/location   { "lat": 18.5, "lng": 73.8 }
|
| Sent by the driver's app while online / on a trip. Customers on an
| active booking see it as live tracking.
|
*/

export const updateMyLocation = async (req, res) => {
  try {
    const point = parsePoint(req.body);

    if (!point) {
      return res.status(400).json({ success: false, message: 'Valid lat and lng are required' });
    }

    const partner = await DeliveryPartner.findOneAndUpdate(
      { user: getUserId(req) },
      { $set: { location: point, lastLocationAt: new Date() } },
      { returnDocument: 'after' }
    ).select('location lastLocationAt');

    if (!partner) {
      return res
        .status(404)
        .json({ success: false, message: 'Delivery partner profile not found' });
    }

    return res.status(200).json({
      success: true,
      location: partner.location,
      lastLocationAt: partner.lastLocationAt,
    });
  } catch (error) {
    console.error('Update partner location error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DEACTIVATE / ACTIVATE
|--------------------------------------------------------------------------
|
| Not allowed while the partner has committed trips. Pending requests
| are cancelled.
|
*/

export const deactivateMyPartnerProfile = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findOne({ user: getUserId(req) }).select('_id');

    if (!partner) {
      return res
        .status(404)
        .json({ success: false, message: 'Delivery partner profile not found' });
    }

    const committed = await DeliveryBooking.exists({
      partner: partner._id,
      status: { $in: ON_TRIP_STATUSES },
    });

    if (committed) {
      return res.status(409).json({
        success: false,
        message: 'Complete or cancel your accepted trips before deactivating',
      });
    }

    const updated = await DeliveryPartner.findByIdAndUpdate(
      partner._id,
      { $set: { isActive: false, isOnline: false } },
      { returnDocument: 'after' }
    );

    await DeliveryBooking.updateMany(
      { partner: partner._id, status: 'requested' },
      {
        $set: {
          status: 'cancelled',
          cancelledBy: 'system',
          cancelledAt: new Date(),
          cancellationReason: 'The driver is no longer taking deliveries',
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Partner profile deactivated',
      partner: updated,
    });
  } catch (error) {
    console.error('Deactivate delivery partner error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to deactivate partner profile',
      error: error.message,
    });
  }
};

export const activateMyPartnerProfile = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findOneAndUpdate(
      { user: getUserId(req) },
      { $set: { isActive: true } },
      { returnDocument: 'after' }
    );

    if (!partner) {
      return res
        .status(404)
        .json({ success: false, message: 'Delivery partner profile not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Partner profile activated',
      partner,
    });
  } catch (error) {
    console.error('Activate delivery partner error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to activate partner profile',
      error: error.message,
    });
  }
};
