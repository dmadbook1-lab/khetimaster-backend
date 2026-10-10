import mongoose from 'mongoose';

const farmFieldSchema = new mongoose.Schema(
  {
    field: {
      type: [
        {
          lat: {
            type: Number,
            required: true,
          },

          lng: {
            type: Number,
            required: true,
          },
        },
      ],

      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    fieldName: {
      type: String,
      required: true,
      trim: true,
    },

    /*
    |--------------------------------------------------------------------------
    | CROP
    |--------------------------------------------------------------------------
    */

    cropName: {
      type: String,
      required: true,
      trim: true,
    },

    /*
    |--------------------------------------------------------------------------
    | CROP IMAGE
    |--------------------------------------------------------------------------
    |
    | URL returned by CropGen crop API.
    |
    */

    cropImage: {
      type: String,
      default: '',
      trim: true,
    },

    variety: {
      type: String,
      required: true,
      trim: true,
    },

    sowingDate: {
      type: String,
      required: true,
      trim: true,
    },

    acre: {
      type: Number,
      required: true,
    },

    typeOfIrrigation: {
      type: String,
      required: true,
      trim: true,
    },

    typeOfFarming: {
      type: String,

      enum: [
        'Organic',
        'Inorganic',
        'Integrated',
      ],

      required: true,
    },

    isBarrenLand: {
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
| INDEXES
|--------------------------------------------------------------------------
*/

farmFieldSchema.index({
  createdAt: 1,
});

farmFieldSchema.index({
  user: 1,
});

farmFieldSchema.index({
  cropName: 1,
});

farmFieldSchema.index({
  typeOfFarming: 1,
});

farmFieldSchema.index({
  typeOfIrrigation: 1,
});

export default mongoose.model(
  'FarmField',
  farmFieldSchema,
);