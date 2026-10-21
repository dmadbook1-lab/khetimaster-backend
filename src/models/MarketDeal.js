import mongoose from 'mongoose';

/*
|--------------------------------------------------------------------------
| MARKET DEAL
|--------------------------------------------------------------------------
|
| A buy request from a buyer on a listing, negotiated with the seller.
|
| Flow:
|
|   PENDING   -> buyer sent an offer, or one side countered.
|                awaitingResponseFrom says whose turn it is.
|   ACCEPTED  -> the side whose turn it was accepted the current terms.
|                The quantity is reserved on the listing.
|   COMPLETED -> seller handed over the goods and got paid (offline).
|   REJECTED  -> the side whose turn it was rejected the offer.
|   CANCELLED -> withdrawn by either side (restores stock if ACCEPTED).
|
*/

const negotiationEntrySchema = new mongoose.Schema(
  {
    by: {
      type: String,
      enum: ['BUYER', 'SELLER'],
      required: true,
    },

    action: {
      type: String,
      enum: ['OFFER', 'COUNTER', 'ACCEPT', 'REJECT', 'CANCEL', 'COMPLETE'],
      required: true,
    },

    quantity: {
      type: Number,
      min: 0,
      default: null,
    },

    pricePerUnit: {
      type: Number,
      min: 0,
      default: null,
    },

    message: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },

    at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const marketDealSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MarketListing',
      required: true,
      index: true,
    },

    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    /*
    |--------------------------------------------------------------------------
    | LISTING SNAPSHOT
    |--------------------------------------------------------------------------
    |
    | Kept so the deal still makes sense if the listing is edited later.
    |
    */

    listingSnapshot: {
      title: { type: String, required: true },
      kind: { type: String, required: true },
      category: { type: String, required: true },
      unit: { type: String, required: true },
      image: { type: String, default: '' },
      listedPricePerUnit: { type: Number, required: true },
    },

    /*
    |--------------------------------------------------------------------------
    | CURRENT TERMS
    |--------------------------------------------------------------------------
    */

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    pricePerUnit: {
      type: Number,
      required: true,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    fulfilment: {
      type: String,
      enum: ['PICKUP', 'DELIVERY'],
      default: 'PICKUP',
    },

    deliveryAddress: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },

    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    */

    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },

    awaitingResponseFrom: {
      type: String,
      enum: ['BUYER', 'SELLER', null],
      default: 'SELLER',
    },

    history: {
      type: [negotiationEntrySchema],
      default: [],
    },

    cancelledBy: {
      type: String,
      enum: ['BUYER', 'SELLER', 'SYSTEM', null],
      default: null,
    },

    closingReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },

    acceptedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    /*
    |--------------------------------------------------------------------------
    | BUYER REVIEW OF SELLER
    |--------------------------------------------------------------------------
    */

    review: {
      rating: { type: Number, min: 1, max: 5, default: null },
      comment: { type: String, default: '', trim: true, maxlength: 500 },
      createdAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

marketDealSchema.index({ buyer: 1, createdAt: -1 });

marketDealSchema.index({ seller: 1, createdAt: -1 });

marketDealSchema.index({ listing: 1, buyer: 1, status: 1 });

marketDealSchema.index({ seller: 1, 'review.rating': 1 });

const MarketDeal = mongoose.model('MarketDeal', marketDealSchema);

export default MarketDeal;
