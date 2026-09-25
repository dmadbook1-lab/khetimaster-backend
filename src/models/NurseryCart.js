import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema(
  {
    plant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plant',
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  {
    _id: true,
  }
);

const nurseryCartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const NurseryCart = mongoose.model(
  'NurseryCart',
  nurseryCartSchema
);

export default NurseryCart;