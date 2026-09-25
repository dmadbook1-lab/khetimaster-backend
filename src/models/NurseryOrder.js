import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    plant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plant',
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    image: {
      type: String,
      default: '',
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
      },
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: true,
  }
);

const nurseryOrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: 'Order must contain at least one item',
      },
    },

    deliveryAddress: {
      fullName: {
        type: String,
        required: true,
        trim: true,
      },

      phoneNumber: {
        type: String,
        required: true,
        trim: true,
      },

      address: {
        type: String,
        required: true,
        trim: true,
      },

      village: {
        type: String,
        default: '',
        trim: true,
      },

      taluka: {
        type: String,
        default: '',
        trim: true,
      },

      district: {
        type: String,
        default: '',
        trim: true,
      },

      state: {
        type: String,
        default: '',
        trim: true,
      },

      pincode: {
        type: String,
        required: true,
        trim: true,
      },
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      enum: ['COD', 'ONLINE'],
      default: 'COD',
    },

    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED'],
      default: 'PENDING',
    },

    orderStatus: {
      type: String,
      enum: [
        'PENDING',
        'CONFIRMED',
        'DISPATCHED',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
      ],
      default: 'PENDING',
    },
  },
  {
    timestamps: true,
  }
);

nurseryOrderSchema.index({
  user: 1,
  createdAt: -1,
});

const NurseryOrder = mongoose.model(
  'NurseryOrder',
  nurseryOrderSchema
);

export default NurseryOrder;