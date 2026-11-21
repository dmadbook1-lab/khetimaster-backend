import mongoose from 'mongoose';

import { PAYMENT_METHODS, SCHEDULE_TYPES } from '../data/deliveryOptions.js';

/*
|--------------------------------------------------------------------------
| DELIVERY BOOKING
|--------------------------------------------------------------------------
|
| A customer books a delivery partner to carry goods from pickup to drop.
|
| Flow:
|
|   requested -> waiting for the driver to accept
|   accepted  -> driver is on the way to the pickup
|   arrived   -> driver reached the pickup
|   picked_up -> goods loaded, on the way to the drop
|   delivered -> driver entered the customer's delivery OTP at the drop
|
|   rejected  -> driver declined
|   cancelled -> customer or driver cancelled, or the request expired
|                (cancelledBy: 'system')
|
| Distance, fare and ETA are calculated by the server.
|
*/

const stopSchema = new mongoose.Schema(
  {
    address: { type: String, default: '', trim: true, maxlength: 300 },
    village: { type: String, default: '', trim: true, maxlength: 100 },
    district: { type: String, default: '', trim: true, maxlength: 100 },
    state: { type: String, default: '', trim: true, maxlength: 100 },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    contactName: { type: String, default: '', trim: true, maxlength: 100 },
    contactPhone: { type: String, default: '', trim: true, maxlength: 20 },
  },
  { _id: false }
);

export const DELIVERY_STATUSES = [
  'requested',
  'accepted',
  'arrived',
  'picked_up',
  'delivered',
  'rejected',
  'cancelled',
];

const deliveryBookingSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryPartner',
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | ROUTE
    |--------------------------------------------------------------------------
    */

    pickup: { type: stopSchema, required: true },

    drop: { type: stopSchema, required: true },

    distanceKm: { type: Number, min: 0, required: true },

    // 'gps' when calculated from both stops' coordinates, else 'manual'
    distanceSource: { type: String, enum: ['gps', 'manual'], default: 'manual' },

    /*
    |--------------------------------------------------------------------------
    | GOODS
    |--------------------------------------------------------------------------
    */

    goodsType: { type: String, required: true, trim: true, maxlength: 100 },

    weightKg: { type: Number, min: 0, default: 0 },

    description: { type: String, default: '', trim: true, maxlength: 500 },

    /*
    |--------------------------------------------------------------------------
    | SCHEDULE / ETA
    |--------------------------------------------------------------------------
    |
    | pickupAt: when the goods should be picked up (now, or scheduled).
    | estimatedDurationMinutes: drive + loading time from pickup to drop.
    | estimatedDeliveryAt: when the driver should be free again. Updated
    | as the trip moves forward.
    |
    */

    scheduleType: { type: String, enum: SCHEDULE_TYPES, default: 'now' },

    pickupAt: { type: Date, required: true },

    estimatedDurationMinutes: { type: Number, min: 0, default: 0 },

    estimatedDeliveryAt: { type: Date, required: true },

    /*
    |--------------------------------------------------------------------------
    | FARE (calculated by the server)
    |--------------------------------------------------------------------------
    */

    vehicleType: { type: String, default: '' },

    baseFare: { type: Number, min: 0, default: 0 },

    perKmRate: { type: Number, min: 0, default: 0 },

    distanceFare: { type: Number, min: 0, default: 0 },

    minFare: { type: Number, min: 0, default: 0 },

    totalAmount: { type: Number, min: 0, default: 0 },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cod' },

    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    */

    status: { type: String, enum: DELIVERY_STATUSES, default: 'requested', index: true },

    // Shown to the customer only; the driver enters it at the drop.
    deliveryOtp: { type: String, default: '', select: false },

    customerNotes: { type: String, default: '', trim: true, maxlength: 500 },

    rejectionReason: { type: String, default: '', trim: true, maxlength: 500 },

    cancellationReason: { type: String, default: '', trim: true, maxlength: 500 },

    cancelledBy: { type: String, enum: ['customer', 'partner', 'system', null], default: null },

    acceptedAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    pickedUpAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    review: {
      rating: { type: Number, min: 1, max: 5, default: null },
      comment: { type: String, default: '', trim: true, maxlength: 500 },
      createdAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

deliveryBookingSchema.index({ customer: 1, createdAt: -1 });
deliveryBookingSchema.index({ partner: 1, status: 1, pickupAt: 1 });
deliveryBookingSchema.index({ status: 1, scheduleType: 1, createdAt: 1 });

const DeliveryBooking = mongoose.model('DeliveryBooking', deliveryBookingSchema);

export default DeliveryBooking;
