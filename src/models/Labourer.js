import mongoose from 'mongoose';

const labourerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

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

    profileImage: {
      type: String,
      default: '',
      trim: true,
    },

    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: 'other',
    },

    age: {
      type: Number,
      min: 18,
      max: 100,
      default: null,
    },

    labourType: {
      type: String,
      required: true,
      trim: true,
    },

    skills: {
      type: [String],
      default: [],
    },

    experience: {
      type: Number,
      min: 0,
      default: 0,
    },

    experienceUnit: {
      type: String,
      enum: ['years', 'months'],
      default: 'years',
    },

    expectedWage: {
      type: Number,
      min: 0,
      default: 0,
    },

    wageType: {
      type: String,
      enum: ['daily', 'hourly', 'monthly'],
      default: 'daily',
    },

    availability: {
      type: String,
      enum: ['available', 'unavailable', 'busy'],
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

    languages: {
      type: [String],
      default: [],
    },

    preferredWork: {
      type: [String],
      default: [],
    },

    profileCompleted: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

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

    totalJobsCompleted: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

labourerSchema.index({
  fullName: 'text',
  labourType: 'text',
  skills: 'text',
  preferredWork: 'text',
});

labourerSchema.index({
  availability: 1,
  isActive: 1,
});

labourerSchema.index({
  state: 1,
  district: 1,
});

const Labourer = mongoose.model('Labourer', labourerSchema);

export default Labourer;
