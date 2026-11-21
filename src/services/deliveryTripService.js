import mongoose from 'mongoose';

import DeliveryBooking from '../models/DeliveryBooking.js';
import {
  NOW_REQUEST_TIMEOUT_MINUTES,
  REACH_PICKUP_MINUTES,
} from '../data/deliveryOptions.js';

/*
|--------------------------------------------------------------------------
| DELIVERY TRIP STATE
|--------------------------------------------------------------------------
|
| Shared by the partner and booking controllers.
|
*/

const MINUTE_MS = 60 * 1000;

// The driver is committed to these bookings.
export const ON_TRIP_STATUSES = ['accepted', 'arrived', 'picked_up'];

// Bookings that are still going somewhere.
export const ACTIVE_STATUSES = ['requested', ...ON_TRIP_STATUSES];

/*
 * An accepted scheduled trip counts as the driver's current trip from
 * this long before its pickup time.
 */
const CURRENT_TRIP_LEAD_MS = (REACH_PICKUP_MINUTES + 15) * MINUTE_MS;

export const minutesFromNow = (minutes, from = Date.now()) =>
  new Date(from + minutes * MINUTE_MS);

/*
 * Requests that can no longer happen:
 *  - "book now" requests the driver didn't answer in time
 *  - scheduled requests whose pickup time has passed
 */
export const expireStaleDeliveryRequests = () => {
  const now = new Date();

  return DeliveryBooking.updateMany(
    {
      status: 'requested',
      $or: [
        {
          scheduleType: 'now',
          createdAt: { $lt: minutesFromNow(-NOW_REQUEST_TIMEOUT_MINUTES) },
        },
        { scheduleType: 'scheduled', pickupAt: { $lt: now } },
      ],
    },
    {
      $set: {
        status: 'cancelled',
        cancelledBy: 'system',
        cancelledAt: now,
        cancellationReason: 'Request expired: the driver did not respond in time',
      },
    }
  );
};

/*
 * Committed trips of a partner whose [pickupAt, estimatedDeliveryAt]
 * window overlaps [start, end].
 */
export const findOverlappingTrip = (partnerId, start, end, excludeId = null) =>
  DeliveryBooking.findOne({
    partner: partnerId,
    status: { $in: ON_TRIP_STATUSES },
    pickupAt: { $lt: end },
    estimatedDeliveryAt: { $gt: start },
    ...(excludeId && { _id: { $ne: excludeId } }),
  })
    .select('_id pickupAt estimatedDeliveryAt status')
    .lean();

/*
 * Is the partner on a trip right now (or about to start one)?
 */
export const findCurrentTrip = (partnerId, excludeId = null) =>
  DeliveryBooking.findOne({
    partner: partnerId,
    ...(excludeId && { _id: { $ne: excludeId } }),
    $or: [
      { status: { $in: ['arrived', 'picked_up'] } },
      { status: 'accepted', pickupAt: { $lte: new Date(Date.now() + CURRENT_TRIP_LEAD_MS) } },
    ],
  })
    .select('_id status estimatedDeliveryAt')
    .lean();

/*
 * Public trip state for a set of partners, so customers can see why a
 * driver is busy and until when. Only the goods type and the villages /
 * districts are shared, never who booked them.
 *
 * Returns Map(partnerId -> {
 *   currentTrip: {status, goodsType, from, to, pickupAt, busyUntil} | null,
 *   upcomingTrips: number,
 *   nextPickupAt: Date | null,
 * })
 */
export const getPartnerTripInfo = async (partnerIds) => {
  const info = new Map();

  if (!partnerIds.length) return info;

  const ids = partnerIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const leadCutoff = Date.now() + CURRENT_TRIP_LEAD_MS;

  const trips = await DeliveryBooking.find({
    partner: { $in: ids },
    status: { $in: ON_TRIP_STATUSES },
  })
    .select('partner status goodsType pickup.village pickup.district drop.village drop.district pickupAt estimatedDeliveryAt')
    .sort({ pickupAt: 1 })
    .lean();

  for (const id of ids) {
    info.set(String(id), { currentTrip: null, upcomingTrips: 0, nextPickupAt: null });
  }

  for (const trip of trips) {
    const entry = info.get(String(trip.partner));
    if (!entry) continue;

    const isCurrent =
      trip.status !== 'accepted' || new Date(trip.pickupAt).getTime() <= leadCutoff;

    if (isCurrent && !entry.currentTrip) {
      entry.currentTrip = {
        status: trip.status,
        goodsType: trip.goodsType,
        from: trip.pickup?.village || trip.pickup?.district || '',
        to: trip.drop?.village || trip.drop?.district || '',
        pickupAt: trip.pickupAt,
        busyUntil: trip.estimatedDeliveryAt,
      };
    } else if (!isCurrent) {
      entry.upcomingTrips += 1;
      entry.nextPickupAt = entry.nextPickupAt || trip.pickupAt;
    }
  }

  return info;
};
