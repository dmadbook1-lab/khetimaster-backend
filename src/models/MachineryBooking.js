import mongoose from 'mongoose';

/*
|--------------------------------------------------------------------------
| MACHINERY BOOKING
|--------------------------------------------------------------------------
|
| A farmer rents a machine from its owner.
|
| Flow:
|
|   pending   -> farmer sent the request, waiting for the owner
|   confirmed -> owner accepted ('accepted' is kept for old data and
|                treated the same as confirmed)
|   completed -> work done (farmer or owner marks it)
|   rejected  -> owner declined
|   cancelled -> farmer or owner cancelled, or the request expired
|                (cancelledBy: 'system')
|
| The machine is blocked from bookingDate to endDate between startMinute
| and endMinute each day (0 - 1440 = the whole day). Two confirmed
| bookings for the same machine never overlap.
|
| bookingDate / endDate are stored as UTC midnight of the Indian calendar
| date so the same day always compares equal.
|
*/

const machineryBookingSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    machinery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Machinery',
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | SCHEDULE
    |--------------------------------------------------------------------------
    */

    bookingDate: { type: Date, required: true },

    endDate: { type: Date, default: null },

    startTime: { type: String, required: true, trim: true },

    endTime: { type: String, default: '', trim: true },

    startMinute: { type: Number, min: 0, max: 1440, default: null },

    endMinute: { type: Number, min: 0, max: 1440, default: null },

    /*
    |--------------------------------------------------------------------------
    | SERVICE / WORK
    |--------------------------------------------------------------------------
    */

    workType: { type: String, required: true, trim: true },

    service: { type: String, default: '', trim: true },

    selectedImplement: { type: String, default: '', trim: true },

    /*
    |--------------------------------------------------------------------------
    | PRICING
    |--------------------------------------------------------------------------
    |
    | Everything here is calculated by the server from the machine's rates.
    |
    */

    pricingType: {
      type: String,
      enum: ['hourly', 'daily', 'custom'],
      default: 'daily',
    },

    customRate: {
      name: { type: String, default: '' },
      amount: { type: Number, min: 0, default: 0 },
      unit: { type: String, default: '' },
    },

    duration: { type: Number, min: 0, default: 0 },

    durationUnit: {
      type: String,
      enum: ['hours', 'days', 'jobs', 'acres', 'custom'],
      default: 'days',
    },

    rate: { type: Number, min: 0, default: 0 },

    basePrice: { type: Number, min: 0, default: 0 },

    platformFee: { type: Number, min: 0, default: 0 },

    taxes: { type: Number, min: 0, default: 0 },

    totalAmount: { type: Number, min: 0, default: 0 },

    /*
    |--------------------------------------------------------------------------
    | WORK LOCATION (the farmer's farm)
    |--------------------------------------------------------------------------
    */

    state: { type: String, default: '', trim: true },

    district: { type: String, default: '', trim: true },

    village: { type: String, default: '', trim: true },

    address: { type: String, default: '', trim: true },

    farmName: { type: String, default: '', trim: true },

    farmLocation: { type: String, default: '', trim: true },

    farmSize: { type: String, default: '', trim: true },

    crop: { type: String, default: '', trim: true },

    /*
    |--------------------------------------------------------------------------
    | PAYMENT
    |--------------------------------------------------------------------------
    */

    paymentMethod: {
      type: String,
      enum: ['cod', 'upi', 'card', 'wallet'],
      default: 'cod',
    },

    /*
    |--------------------------------------------------------------------------
    | NOTES
    |--------------------------------------------------------------------------
    */

    farmerNotes: { type: String, default: '', trim: true, maxlength: 500 },

    ownerNotes: { type: String, default: '', trim: true, maxlength: 500 },

    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    */

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'accepted', 'rejected', 'cancelled', 'completed'],
      default: 'pending',
      index: true,
    },

    rejectionReason: { type: String, default: '', trim: true, maxlength: 500 },

    cancellationReason: { type: String, default: '', trim: true, maxlength: 500 },

    cancelledBy: {
      type: String,
      enum: ['farmer', 'owner', 'system', null],
      default: null,
    },

    acceptedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    /*
    |--------------------------------------------------------------------------
    | FARMER REVIEW OF MACHINERY / OWNER
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

machineryBookingSchema.index({ farmer: 1, createdAt: -1 });

machineryBookingSchema.index({ machinery: 1, createdAt: -1 });

machineryBookingSchema.index({ bookingDate: 1, status: 1 });

machineryBookingSchema.index({ machinery: 1, status: 1, bookingDate: 1 });

const MachineryBooking = mongoose.model('MachineryBooking', machineryBookingSchema);

export default MachineryBooking;
