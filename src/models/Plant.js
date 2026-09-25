import mongoose from 'mongoose';

const plantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: '',
      trim: true,
    },

    images: {
      type: [String],
      default: [],
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    seller: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
      },
    },

    location: {
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
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Search index
plantSchema.index({
  name: 'text',
  description: 'text',
});

// Category filtering
plantSchema.index({
  category: 1,
});

// Location filtering
plantSchema.index({
  'location.state': 1,
  'location.district': 1,
});

const Plant = mongoose.model('Plant', plantSchema);

export default Plant;