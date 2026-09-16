import mongoose from 'mongoose';

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

    consultationDate: {
      type: Date,
      required: true,
      index: true,
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

    consultationType: {
      type: String,
      enum: ['veterinary', 'agricultural'],
      required: true,
    },

    problemType: {
      type: String,
      default: '',
      trim: true,
    },

    animalType: {
      type: String,
      default: '',
      trim: true,
    },

    animalCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    animalAge: {
      type: String,
      default: '',
      trim: true,
    },

    symptoms: {
      type: String,
      default: '',
      trim: true,
    },

    description: {
      type: String,
      default: '',
      trim: true,
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

    address: {
      type: String,
      default: '',
      trim: true,
    },

    consultationFee: {
      type: Number,
      min: 0,
      default: 0,
    },

    totalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    paymentMethod: {
      type: String,
      enum: ['cod', 'upi', 'card', 'wallet'],
      default: 'cod',
    },

    farmerNotes: {
      type: String,
      default: '',
      trim: true,
    },

    doctorNotes: {
      type: String,
      default: '',
      trim: true,
    },

    diagnosis: {
      type: String,
      default: '',
      trim: true,
    },

    prescription: {
      type: String,
      default: '',
      trim: true,
    },

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
  }
);

doctorConsultationSchema.index({
  farmer: 1,
  createdAt: -1,
});

doctorConsultationSchema.index({
  doctor: 1,
  createdAt: -1,
});

doctorConsultationSchema.index({
  consultationDate: 1,
  status: 1,
});

const DoctorConsultation = mongoose.model(
  'DoctorConsultation',
  doctorConsultationSchema
);

export default DoctorConsultation;