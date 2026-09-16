import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    /*
    |--------------------------------------------------------------------------
    | USER
    |--------------------------------------------------------------------------
    */

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | BASIC INFORMATION
    |--------------------------------------------------------------------------
    */

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      default: '',
      trim: true,
    },

    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },

    profileImage: {
      type: String,
      default: '',
      trim: true,
    },

    /*
    |--------------------------------------------------------------------------
    | DOCTOR TYPE
    |--------------------------------------------------------------------------
    */

    doctorType: {
      type: String,
      enum: [
        'veterinarian',
        'agriculturalDoctor',
      ],
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | PROFESSIONAL INFORMATION
    |--------------------------------------------------------------------------
    */

    specialization: {
      type: [String],
      default: [],
    },

    qualification: {
      type: [String],
      default: [],
    },

    /*
    | Certificate is only stored as profile information.
    | It does NOT require verification.
    */

    doctorateCertificate: {
      type: String,
      default: '',
      trim: true,
    },

    languages: {
      type: [String],
      default: [],
    },

    about: {
      type: String,
      default: '',
      trim: true,
    },

    /*
    |--------------------------------------------------------------------------
    | CONSULTATION
    |--------------------------------------------------------------------------
    */

    consultationFee: {
      type: Number,
      min: 0,
      default: 0,
    },

    consultationFeeType: {
      type: String,
      enum: [
        'free',
        'perConsultation',
      ],
      default: 'perConsultation',
    },

    /*
    |--------------------------------------------------------------------------
    | AVAILABILITY
    |--------------------------------------------------------------------------
    */

    availability: {
      type: String,
      enum: [
        'available',
        'unavailable',
        'busy',
      ],
      default: 'available',
      index: true,
    },

    availableFrom: {
      type: Date,
      default: null,
    },

    availableUntil: {
      type: Date,
      default: null,
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
    | STATUS
    |--------------------------------------------------------------------------
    */

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | RATINGS
    |--------------------------------------------------------------------------
    */

    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },

    totalReviews: {
      type: Number,
      min: 0,
      default: 0,
    },

    /*
    |--------------------------------------------------------------------------
    | CONSULTATION STATISTICS
    |--------------------------------------------------------------------------
    */

    totalConsultations: {
      type: Number,
      min: 0,
      default: 0,
    },

    /*
    |--------------------------------------------------------------------------
    | PROFILE
    |--------------------------------------------------------------------------
    */

    profileCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| SEARCH INDEX
|--------------------------------------------------------------------------
*/

doctorSchema.index({
  fullName: 'text',
  doctorType: 'text',
  specialization: 'text',
  qualification: 'text',
  about: 'text',
});

/*
|--------------------------------------------------------------------------
| AVAILABILITY INDEX
|--------------------------------------------------------------------------
*/

doctorSchema.index({
  availability: 1,
  isActive: 1,
});

/*
|--------------------------------------------------------------------------
| LOCATION INDEX
|--------------------------------------------------------------------------
*/

doctorSchema.index({
  state: 1,
  district: 1,
});

const Doctor = mongoose.model(
  'Doctor',
  doctorSchema,
);

export default Doctor;