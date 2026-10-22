import mongoose from 'mongoose';

/*
|--------------------------------------------------------------------------
| DOCTOR CONSULTATION
|--------------------------------------------------------------------------
|
| A farmer asks a veterinarian or agricultural doctor for a consultation.
|
| Flow:
|
|   pending   -> farmer sent the request, waiting for the doctor
|   accepted  -> doctor accepted ('confirmed' is kept for old data and
|                treated the same as accepted)
|   completed -> consultation done; doctor records diagnosis and
|                prescription
|   rejected  -> doctor declined
|   cancelled -> farmer or doctor cancelled, or the request expired
|                (cancelledBy: 'system')
|
| The doctor is blocked between startMinute and endMinute on
| consultationDate. Two accepted consultations never overlap.
|
| consultationDate is stored as UTC midnight of the Indian calendar date
| so the same day always compares equal.
|
*/

const doctorConsultationSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | SCHEDULE
    |--------------------------------------------------------------------------
    */

    consultationDate: { type: Date, required: true, index: true },

    startTime: { type: String, required: true, trim: true },

    endTime: { type: String, default: '', trim: true },

    startMinute: { type: Number, min: 0, max: 1440, default: null },

    endMinute: { type: Number, min: 0, max: 1440, default: null },

    /*
    |--------------------------------------------------------------------------
    | PROBLEM
    |--------------------------------------------------------------------------
    */

    consultationType: {
      type: String,
      enum: ['veterinary', 'agricultural'],
      required: true,
    },

    problemType: { type: String, default: '', trim: true },

    animalType: { type: String, default: '', trim: true },

    animalCount: { type: Number, min: 0, default: 0 },

    animalAge: { type: String, default: '', trim: true },

    cropName: { type: String, default: '', trim: true },

    symptoms: { type: String, default: '', trim: true, maxlength: 2000 },

    description: { type: String, default: '', trim: true, maxlength: 2000 },

    // Photos of the sick animal / affected crop (URLs)
    images: { type: [String], default: [] },

    /*
    |--------------------------------------------------------------------------
    | LOCATION (the farmer's place)
    |--------------------------------------------------------------------------
    */

    state: { type: String, default: '', trim: true },

    district: { type: String, default: '', trim: true },

    village: { type: String, default: '', trim: true },

    address: { type: String, default: '', trim: true },

    /*
    |--------------------------------------------------------------------------
    | PAYMENT (calculated by the server from the doctor's fee)
    |--------------------------------------------------------------------------
    */

    consultationFee: { type: Number, min: 0, default: 0 },

    totalAmount: { type: Number, min: 0, default: 0 },

    paymentMethod: {
      type: String,
      enum: ['cod', 'upi', 'card', 'wallet'],
      default: 'cod',
    },

    /*
    |--------------------------------------------------------------------------
    | NOTES / OUTCOME
    |--------------------------------------------------------------------------
    */

    farmerNotes: { type: String, default: '', trim: true, maxlength: 1000 },

    doctorNotes: { type: String, default: '', trim: true, maxlength: 2000 },

    diagnosis: { type: String, default: '', trim: true, maxlength: 2000 },

    prescription: { type: String, default: '', trim: true, maxlength: 2000 },

    followUpDate: { type: Date, default: null },

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
      enum: ['farmer', 'doctor', 'system', null],
      default: null,
    },

    acceptedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    /*
    |--------------------------------------------------------------------------
    | FARMER REVIEW OF DOCTOR
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

doctorConsultationSchema.index({ farmer: 1, createdAt: -1 });

doctorConsultationSchema.index({ doctor: 1, createdAt: -1 });

doctorConsultationSchema.index({ consultationDate: 1, status: 1 });

doctorConsultationSchema.index({ doctor: 1, status: 1, consultationDate: 1 });

const DoctorConsultation = mongoose.model('DoctorConsultation', doctorConsultationSchema);

export default DoctorConsultation;
