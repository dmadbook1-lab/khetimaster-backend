import mongoose from 'mongoose';

/*
|--------------------------------------------------------------------------
| LABOUR BOOKING
|--------------------------------------------------------------------------
|
| A farmer hires a labourer for one or more days starting bookingDate.
|
| Flow:
|
|   pending   -> farmer sent the request, waiting for the labourer
|   accepted  -> labourer accepted ('confirmed' is kept for old data and
|                treated the same as accepted)
|   completed -> work done (farmer or labourer marks it)
|   rejected  -> labourer declined
|   cancelled -> farmer or labourer cancelled, or the request expired
|                (cancelledBy: 'system')
|
| bookingDate / endDate are stored as UTC midnight of the Indian calendar
| date so the same day always compares equal.
|
*/

const labourBookingSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    labourer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Labourer',
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | SCHEDULE
    |--------------------------------------------------------------------------
    */

    bookingDate: { type: Date, required: true },

    numberOfDays: { type: Number, min: 1, default: 1 },

    endDate: { type: Date, default: null },

    startTime: { type: String, required: true, trim: true },

    endTime: { type: String, default: '', trim: true },

    /*
    |--------------------------------------------------------------------------
    | WORK
    |--------------------------------------------------------------------------
    */

    workType: { type: String, required: true, trim: true },

    description: { type: String, default: '', trim: true, maxlength: 1000 },

    state: { type: String, default: '', trim: true },

    district: { type: String, default: '', trim: true },

    village: { type: String, default: '', trim: true },

    address: { type: String, default: '', trim: true },

    /*
    |--------------------------------------------------------------------------
    | PAYMENT
    |--------------------------------------------------------------------------
    |
    | wage is per wageType unit. totalAmount is calculated by the server.
    |
    */

    wage: { type: Number, min: 0, default: 0 },

    wageType: { type: String, enum: ['daily', 'hourly', 'monthly'], default: 'daily' },

    totalAmount: { type: Number, min: 0, default: 0 },

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

    farmerNotes: { type: String, default: '', trim: true, maxlength: 500 },

    rejectionReason: { type: String, default: '', trim: true, maxlength: 500 },

    cancellationReason: { type: String, default: '', trim: true, maxlength: 500 },

    cancelledBy: {
      type: String,
      enum: ['farmer', 'labourer', 'system', null],
      default: null,
    },

    acceptedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    /*
    |--------------------------------------------------------------------------
    | FARMER REVIEW OF LABOURER
    |--------------------------------------------------------------------------
    */

    review: {
      rating: { type: Number, min: 1, max: 5, default: null },
      comment: { type: String, default: '', trim: true, maxlength: 500 },
      createdAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

labourBookingSchema.index({ farmer: 1, createdAt: -1 });
labourBookingSchema.index({ labourer: 1, createdAt: -1 });
labourBookingSchema.index({ bookingDate: 1, status: 1 });
labourBookingSchema.index({ labourer: 1, status: 1, bookingDate: 1 });

const LabourBooking = mongoose.model('LabourBooking', labourBookingSchema);

export default LabourBooking;
