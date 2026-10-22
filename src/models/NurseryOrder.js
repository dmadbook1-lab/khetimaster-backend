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

    /*
     * Each seller moves their own items forward. Older orders have no
     * item status; for them the order's orderStatus applies.
     */
    status: {
      type: String,
      enum: [
        'PENDING',
        'CONFIRMED',
        'DISPATCHED',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
        null,
      ],
      default: null,
    },

    statusUpdatedAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },

    review: {
      rating: { type: Number, min: 1, max: 5, default: null },
      comment: { type: String, default: '', trim: true, maxlength: 500 },
      createdAt: { type: Date, default: null },
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

    /*
     * Overall status, derived from the item statuses: the least
     * advanced item that isn't cancelled (CANCELLED if all are).
     */
    orderStatus: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
      default: 'PENDING',
    },

    cancelledBy: {
      type: String,
      enum: ['BUYER', 'SELLER', null],
      default: null,
    },

    cancellationReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,

    // Concurrent buyer / seller updates fail instead of overwriting
    optimisticConcurrency: true,
  }
);

nurseryOrderSchema.index({
  user: 1,
  createdAt: -1,
});

nurseryOrderSchema.index({
  'items.seller.userId': 1,
  createdAt: -1,
});

nurseryOrderSchema.index({
  'items.plant': 1,
});

const NurseryOrder = mongoose.model('NurseryOrder', nurseryOrderSchema);

export default NurseryOrder;
