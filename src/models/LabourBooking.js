import mongoose from 'mongoose';

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

    bookingDate: { type: Date, required: true },

    startTime: { type: String, required: true, trim: true },

    endTime: { type: String, default: '', trim: true },

    workType: { type: String, required: true, trim: true },

    description: { type: String, default: '', trim: true },

    state: { type: String, default: '', trim: true },

    district: { type: String, default: '', trim: true },

    village: { type: String, default: '', trim: true },

    address: { type: String, default: '', trim: true },

    wage: { type: Number, min: 0, default: 0 },

    totalAmount: { type: Number, min: 0, default: 0 },

    wageType: { type: String, enum: ['daily', 'hourly', 'monthly'], default: 'daily' },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'accepted', 'rejected', 'cancelled', 'completed'],
      default: 'pending',
      index: true,
    },

    farmerNotes: { type: String, default: '', trim: true },

    cancellationReason: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

labourBookingSchema.index({ farmer: 1, createdAt: -1 });
labourBookingSchema.index({ labourer: 1, createdAt: -1 });
labourBookingSchema.index({ bookingDate: 1, status: 1 });

const LabourBooking = mongoose.model('LabourBooking', labourBookingSchema);

export default LabourBooking;
