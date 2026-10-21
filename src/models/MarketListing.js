import mongoose from 'mongoose';

import {
  LISTING_KINDS,
  MARKET_CATEGORIES,
  MARKET_UNITS,
  EQUIPMENT_CONDITIONS,
  PRODUCE_GRADES,
} from '../data/marketCategories.js';

/*
|--------------------------------------------------------------------------
| MARKET LISTING
|--------------------------------------------------------------------------
|
| Something a user wants to sell: produce (soybean, onions, apples...)
| or equipment (tractor, rotavator...).
|
| quantity is the amount still available. It is reduced atomically when
| a deal is accepted and restored when an accepted deal is cancelled.
|
*/

const marketListingSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | WHAT IS BEING SOLD
    |--------------------------------------------------------------------------
    */

    kind: {
      type: String,
      enum: LISTING_KINDS,
      required: true,
    },

    category: {
      type: String,
      enum: MARKET_CATEGORIES.map((category) => category.key),
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },

    images: {
      type: [String],
      default: [],
    },

    /*
    |--------------------------------------------------------------------------
    | PRODUCE DETAILS
    |--------------------------------------------------------------------------
    */

    variety: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
    },

    grade: {
      type: String,
      enum: PRODUCE_GRADES,
      default: 'ungraded',
    },

    isOrganic: {
      type: Boolean,
      default: false,
    },

    harvestDate: {
      type: Date,
      default: null,
    },

    /*
    |--------------------------------------------------------------------------
    | EQUIPMENT DETAILS (brand is also used for INPUTS)
    |--------------------------------------------------------------------------
    */

    brand: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
    },

    model: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
    },

    modelYear: {
      type: Number,
      min: 1900,
      max: 2100,
      default: null,
    },

    condition: {
      type: String,
      enum: [...EQUIPMENT_CONDITIONS, null],
      default: null,
    },

    usageHours: {
      type: Number,
      min: 0,
      default: null,
    },

    /*
    |--------------------------------------------------------------------------
    | INPUT DETAILS (fertilizers, pesticides...)
    |--------------------------------------------------------------------------
    |
    | composition -> technical content, e.g. "NPK 19:19:19",
    |                "Chlorpyrifos 20% EC"
    | packSize    -> size of one unit, e.g. "50 kg bag", "1 litre bottle"
    |
    */

    composition: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },

    packSize: {
      type: String,
      default: '',
      trim: true,
      maxlength: 50,
    },

    manufacturingDate: {
      type: Date,
      default: null,
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    isSealed: {
      type: Boolean,
      default: true,
    },

    /*
    |--------------------------------------------------------------------------
    | QUANTITY & PRICE
    |--------------------------------------------------------------------------
    */

    unit: {
      type: String,
      enum: MARKET_UNITS,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    minOrderQuantity: {
      type: Number,
      min: 0,
      default: null,
    },

    pricePerUnit: {
      type: Number,
      required: true,
      min: 0,
    },

    isNegotiable: {
      type: Boolean,
      default: true,
    },

    /*
    |--------------------------------------------------------------------------
    | DELIVERY
    |--------------------------------------------------------------------------
    */

    deliveryAvailable: {
      type: Boolean,
      default: false,
    },

    deliveryNotes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300,
    },

    /*
    |--------------------------------------------------------------------------
    | LOCATION
    |--------------------------------------------------------------------------
    */

    location: {
      state: { type: String, default: '', trim: true },
      district: { type: String, default: '', trim: true },
      taluka: { type: String, default: '', trim: true },
      village: { type: String, default: '', trim: true },
      pincode: { type: String, default: '', trim: true },
    },

    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    |
    | ACTIVE  -> visible to buyers
    | PAUSED  -> hidden by the seller
    | SOLD    -> quantity reached 0
    | DELETED -> removed by the seller (soft delete)
    |
    */

    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'SOLD', 'DELETED'],
      default: 'ACTIVE',
      index: true,
    },

    views: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

/*
|--------------------------------------------------------------------------
| INDEXES
|--------------------------------------------------------------------------
*/

marketListingSchema.index({ status: 1, kind: 1, category: 1, createdAt: -1 });

marketListingSchema.index({ status: 1, 'location.state': 1, 'location.district': 1 });

marketListingSchema.index({ status: 1, pricePerUnit: 1 });

marketListingSchema.index({ seller: 1, createdAt: -1 });

const MarketListing = mongoose.model('MarketListing', marketListingSchema);

export default MarketListing;
