import mongoose from 'mongoose';

const machineryBookingSchema =
  new mongoose.Schema(
    {
      /*
      |--------------------------------------------------------------------------
      | FARMER
      |--------------------------------------------------------------------------
      */

      farmer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | MACHINERY
      |--------------------------------------------------------------------------
      */

      machinery: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Machinery',
        required: true,
        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | BOOKING DATE
      |--------------------------------------------------------------------------
      */

      bookingDate: {
        type: Date,
        required: true,
      },

      startTime: {
        type: String,
        required: true,
        trim: true,
      },

      endTime: {
        type: String,
        default: '',
        trim: true,
      },

      /*
      |--------------------------------------------------------------------------
      | SERVICE / WORK
      |--------------------------------------------------------------------------
      */

      workType: {
        type: String,
        required: true,
        trim: true,
      },

      service: {
        type: String,
        default: '',
        trim: true,
      },

      /*
      |--------------------------------------------------------------------------
      | SELECTED IMPLEMENT
      |--------------------------------------------------------------------------
      */

      selectedImplement: {
        type: String,
        default: '',
        trim: true,
      },

      /*
      |--------------------------------------------------------------------------
      | PRICING TYPE
      |--------------------------------------------------------------------------
      */

      pricingType: {
        type: String,
        enum: [
          'hourly',
          'daily',
          'custom',
        ],
        default: 'daily',
      },

      /*
      |--------------------------------------------------------------------------
      | DURATION
      |--------------------------------------------------------------------------
      */

      duration: {
        type: Number,
        min: 0,
        default: 0,
      },

      durationUnit: {
        type: String,
        enum: [
          'hours',
          'days',
          'jobs',
          'acres',
          'custom',
        ],
        default: 'days',
      },

      /*
      |--------------------------------------------------------------------------
      | PRICING
      |--------------------------------------------------------------------------
      */

      basePrice: {
        type: Number,
        min: 0,
        default: 0,
      },

      platformFee: {
        type: Number,
        min: 0,
        default: 0,
      },

      taxes: {
        type: Number,
        min: 0,
        default: 0,
      },

      totalAmount: {
        type: Number,
        min: 0,
        default: 0,
      },

      /*
      |--------------------------------------------------------------------------
      | LOCATION
      |--------------------------------------------------------------------------
      */

      state: {
        type: String,
        default: '',
        trim: true,
      },

      district: {
        type: String,
        default: '',
        trim: true,
      },

      village: {
        type: String,
        default: '',
        trim: true,
      },

      address: {
        type: String,
        default: '',
        trim: true,
      },

      /*
      |--------------------------------------------------------------------------
      | FARM INFORMATION
      |--------------------------------------------------------------------------
      */

      farmName: {
        type: String,
        default: '',
        trim: true,
      },

      farmLocation: {
        type: String,
        default: '',
        trim: true,
      },

      farmSize: {
        type: String,
        default: '',
        trim: true,
      },

      crop: {
        type: String,
        default: '',
        trim: true,
      },

      /*
      |--------------------------------------------------------------------------
      | PAYMENT
      |--------------------------------------------------------------------------
      */

      paymentMethod: {
        type: String,
        enum: [
          'cod',
          'upi',
          'card',
          'wallet',
        ],
        default: 'cod',
      },

      /*
      |--------------------------------------------------------------------------
      | NOTES
      |--------------------------------------------------------------------------
      */

      farmerNotes: {
        type: String,
        default: '',
        trim: true,
      },

      ownerNotes: {
        type: String,
        default: '',
        trim: true,
      },

      /*
      |--------------------------------------------------------------------------
      | STATUS
      |--------------------------------------------------------------------------
      */

      status: {
        type: String,
        enum: [
          'pending',
          'confirmed',
          'accepted',
          'rejected',
          'cancelled',
          'completed',
        ],
        default: 'pending',
        index: true,
      },

      cancellationReason: {
        type: String,
        default: '',
        trim: true,
      },
    },
    {
      timestamps: true,
    },
  );

/*
|--------------------------------------------------------------------------
| INDEXES
|--------------------------------------------------------------------------
*/

machineryBookingSchema.index({
  farmer: 1,
  createdAt: -1,
});

machineryBookingSchema.index({
  machinery: 1,
  createdAt: -1,
});

machineryBookingSchema.index({
  bookingDate: 1,
  status: 1,
});

const MachineryBooking =
  mongoose.model(
    'MachineryBooking',
    machineryBookingSchema,
  );

export default MachineryBooking;