import mongoose from 'mongoose';

const machinerySchema = new mongoose.Schema(
  {
    /*
    |--------------------------------------------------------------------------
    | OWNER
    |--------------------------------------------------------------------------
    |
    | If the user is authenticated, this will contain the User ObjectId.
    | It is no longer required because the owner can also manually enter
    | an owner name from the rental profile flow.
    |
    */

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | OWNER NAME
    |--------------------------------------------------------------------------
    |
    | This is the name displayed to farmers.
    | Example: "Vishal Pillai"
    |
    */

    ownerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    /*
    |--------------------------------------------------------------------------
    | BASIC MACHINERY INFORMATION
    |--------------------------------------------------------------------------
    */

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    brand: {
      type: String,
      default: '',
      trim: true,
    },

    model: {
      type: String,
      default: '',
      trim: true,
    },

    modelYear: {
      type: Number,
      min: 1900,
      max: 2100,
      default: null,
    },

    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },

    /*
    |--------------------------------------------------------------------------
    | IMAGES
    |--------------------------------------------------------------------------
    */

    images: {
      type: [String],
      default: [],
    },

    /*
    |--------------------------------------------------------------------------
    | ENGINE SPECIFICATIONS
    |--------------------------------------------------------------------------
    */

    enginePower: {
      value: {
        type: Number,
        min: 0,
        default: 0,
      },

      unit: {
        type: String,
        enum: ['HP', 'kW', 'CC'],
        default: 'HP',
      },
    },

    /*
    |--------------------------------------------------------------------------
    | FUEL
    |--------------------------------------------------------------------------
    */

    fuelType: {
      type: String,
      enum: [
        'petrol',
        'diesel',
        'electric',
        'other',
      ],
      default: 'diesel',
    },

    /*
    |--------------------------------------------------------------------------
    | DRIVE
    |--------------------------------------------------------------------------
    */

    driveType: {
      type: String,
      enum: [
        '2WD',
        '4WD',
        'AWD',
        'other',
      ],
      default: '2WD',
    },

    /*
    |--------------------------------------------------------------------------
    | IMPLEMENTS
    |--------------------------------------------------------------------------
    */

    supportsImplements: {
      type: Boolean,
      default: false,
    },

    supportedImplements: {
      type: [String],
      default: [],
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
    | PRICING
    |--------------------------------------------------------------------------
    */

    pricing: {
      hourly: {
        type: Number,
        min: 0,
        default: 0,
      },

      daily: {
        type: Number,
        min: 0,
        default: 0,
      },

      custom: {
        type: [
          {
            name: {
              type: String,
              required: true,
              trim: true,
            },

            amount: {
              type: Number,
              min: 0,
              required: true,
            },

            unit: {
              type: String,
              enum: [
                'hour',
                'day',
                'job',
                'acre',
                'custom',
              ],
              default: 'custom',
            },
          },
        ],
        default: [],
      },
    },

    /*
    |--------------------------------------------------------------------------
    | OWNER NOTES
    |--------------------------------------------------------------------------
    */

    ownerNotes: {
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

    totalJobsCompleted: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| INDEXES
|--------------------------------------------------------------------------
*/

machinerySchema.index({
  name: 'text',
  brand: 'text',
  model: 'text',
  category: 'text',
  supportedImplements: 'text',
});

machinerySchema.index({
  availability: 1,
  isActive: 1,
});

machinerySchema.index({
  state: 1,
  district: 1,
});

machinerySchema.index({
  owner: 1,
  createdAt: -1,
});

machinerySchema.index({
  ownerName: 1,
});

const Machinery = mongoose.model(
  'Machinery',
  machinerySchema,
);

export default Machinery;