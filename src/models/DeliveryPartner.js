import mongoose from 'mongoose';

import { VEHICLE_KEYS } from '../data/deliveryOptions.js';

/*
|--------------------------------------------------------------------------
| DELIVERY PARTNER
|--------------------------------------------------------------------------
|
| A registered driver with a vehicle. Every partner is listed on the
| platform, but a customer can only book partners registered in the
| same district as the pickup.
|
| isOnline is the driver's "go online / go offline" switch. "Book now"
| requests need the driver online; scheduled pickups don't.
|
*/

const pointSchema = new mongoose.Schema(
  {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
  },
  { _id: false }
);

const deliveryPartnerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    fullName: { type: String, required: true, trim: true, maxlength: 100 },

    phoneNumber: { type: String, default: '', trim: true },

    profileImage: { type: String, default: '', trim: true },

    about: { type: String, default: '', trim: true, maxlength: 300 },

    languages: { type: [String], default: [] },

    /*
    |--------------------------------------------------------------------------
    | VEHICLE
    |--------------------------------------------------------------------------
    */

    vehicleType: { type: String, enum: VEHICLE_KEYS, required: true, index: true },

    vehicleName: { type: String, default: '', trim: true, maxlength: 80 },

    vehicleNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },

    capacityKg: { type: Number, min: 1, max: 50000, required: true },

    /*
    |--------------------------------------------------------------------------
    | RATES
    |--------------------------------------------------------------------------
    |
    | fare = max(minFare, baseFare + perKmRate x km)
    |
    */

    baseFare: { type: Number, min: 0, default: 0 },

    perKmRate: { type: Number, min: 0, default: 0 },

    minFare: { type: Number, min: 0, default: 0 },

    /*
    |--------------------------------------------------------------------------
    | SERVICE AREA
    |--------------------------------------------------------------------------
    */

    state: { type: String, default: '', trim: true },

    district: { type: String, required: true, trim: true },

    taluka: { type: String, default: '', trim: true },

    village: { type: String, default: '', trim: true },

    location: { type: pointSchema, default: null },

    lastLocationAt: { type: Date, default: null },

    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    */

    isOnline: { type: Boolean, default: false, index: true },

    isActive: { type: Boolean, default: true, index: true },

    rating: { type: Number, min: 0, max: 5, default: 0 },

    totalReviews: { type: Number, min: 0, default: 0 },

    totalTrips: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

deliveryPartnerSchema.index({ isActive: 1, district: 1, isOnline: 1 });
deliveryPartnerSchema.index({ state: 1, district: 1 });

const DeliveryPartner = mongoose.model('DeliveryPartner', deliveryPartnerSchema);

export default DeliveryPartner;
