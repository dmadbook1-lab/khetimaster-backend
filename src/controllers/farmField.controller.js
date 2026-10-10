import mongoose from 'mongoose';

import FarmField from '../models/farmField.model.js';
import User from '../models/User.js';

/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const ALLOWED_FARMING_TYPES = [
  'Organic',
  'Inorganic',
  'Integrated',
];

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const isValidUserId = userId => {
  return mongoose.Types.ObjectId.isValid(
    userId,
  );
};

const isValidFieldId = fieldId => {
  return mongoose.Types.ObjectId.isValid(
    fieldId,
  );
};

const validateCoordinates = latlng => {
  if (
    !Array.isArray(latlng) ||
    latlng.length < 3
  ) {
    return false;
  }

  return !latlng.some(point => {
    if (!point) {
      return true;
    }

    const lat = Number(point.lat);
    const lng = Number(point.lng);

    return (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    );
  });
};

const normalizeCoordinates = latlng => {
  return latlng.map(point => ({
    lat: Number(point.lat),
    lng: Number(point.lng),
  }));
};

const normalizeCropImage = cropImage => {
  if (
    typeof cropImage !== 'string'
  ) {
    return '';
  }

  return cropImage.trim();
};

/*
|--------------------------------------------------------------------------
| ADD FARM FIELD
|--------------------------------------------------------------------------
|
| POST /api/field/add-field/:userId
|
*/

export const addField = async (
  req,
  res,
) => {
  try {
    const {userId} = req.params;

    const {
      latlng,
      cropName,
      cropImage,
      variety,
      sowingDate,
      typeOfIrrigation,
      farmName,
      acre,
      typeOfFarming,
      isBarrenLand,
    } = req.body;

    /*
    |--------------------------------------------------------------------------
    | DEBUG
    |--------------------------------------------------------------------------
    */

    console.log(
      '================================================',
    );

    console.log(
      'ADD FARM FIELD',
    );

    console.log(
      'User ID:',
      userId,
    );

    console.log(
      'Crop Name:',
      cropName,
    );

    console.log(
      'Crop Image:',
      cropImage,
    );

    console.log(
      'Crop Image Type:',
      typeof cropImage,
    );

    console.log(
      '================================================',
    );

    /*
    |--------------------------------------------------------------------------
    | USER ID
    |--------------------------------------------------------------------------
    */

    if (!isValidUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid User ID',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | REQUIRED FIELDS
    |--------------------------------------------------------------------------
    */

    if (
      !latlng ||
      !Array.isArray(latlng) ||
      latlng.length < 3 ||
      !cropName ||
      !variety ||
      !sowingDate ||
      !typeOfIrrigation ||
      !farmName ||
      acre === undefined ||
      acre === null ||
      !typeOfFarming
    ) {
      return res.status(400).json({
        success: false,
        message:
          'All fields are required',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | COORDINATES
    |--------------------------------------------------------------------------
    */

    if (
      !validateCoordinates(
        latlng,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid field coordinates. Each point must contain numeric lat and lng.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | AREA
    |--------------------------------------------------------------------------
    */

    const numericAcre =
      Number(acre);

    if (
      !Number.isFinite(
        numericAcre,
      ) ||
      numericAcre <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'acre must be a valid number greater than 0',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FARMING TYPE
    |--------------------------------------------------------------------------
    */

    if (
      !ALLOWED_FARMING_TYPES.includes(
        typeOfFarming,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'typeOfFarming must be Organic, Inorganic, or Integrated',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | USER
    |--------------------------------------------------------------------------
    */

    const user =
      await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          'User not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | NORMALIZE CROP IMAGE
    |--------------------------------------------------------------------------
    */

    const normalizedCropImage =
      normalizeCropImage(
        cropImage,
      );

    /*
    |--------------------------------------------------------------------------
    | CROP IMAGE VALIDATION
    |--------------------------------------------------------------------------
    |
    | A selected crop should have an image.
    | Barren land can remain without one.
    |
    */

    if (
      !Boolean(isBarrenLand) &&
      !normalizedCropImage
    ) {
      return res.status(400).json({
        success: false,
        message:
          'cropImage is required when a crop is selected',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | CREATE FARM
    |--------------------------------------------------------------------------
    */

    const newFarmField =
      new FarmField({
        field:
          normalizeCoordinates(
            latlng,
          ),

        user: userId,

        fieldName:
          String(
            farmName,
          ).trim(),

        cropName:
          String(
            cropName,
          ).trim(),

        cropImage:
          normalizedCropImage,

        variety:
          String(
            variety,
          ).trim(),

        sowingDate:
          String(
            sowingDate,
          ).trim(),

        acre:
          numericAcre,

        typeOfIrrigation:
          String(
            typeOfIrrigation,
          ).trim(),

        typeOfFarming,

        isBarrenLand:
          Boolean(
            isBarrenLand,
          ),
      });

    /*
    |--------------------------------------------------------------------------
    | SAVE
    |--------------------------------------------------------------------------
    */

    const savedFarmField =
      await newFarmField.save();

    /*
    |--------------------------------------------------------------------------
    | RESPONSE DEBUG
    |--------------------------------------------------------------------------
    */

    console.log(
      'Farm saved successfully',
    );

    console.log(
      'Saved crop:',
      savedFarmField.cropName,
    );

    console.log(
      'Saved crop image:',
      savedFarmField.cropImage,
    );

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(201).json({
      success: true,

      message:
        'Farm field created successfully.',

      farmField:
        savedFarmField,
    });
  } catch (error) {
    console.error(
      'Error adding farm field:',
      error,
    );

    if (
      error.name ===
      'ValidationError'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Validation error',
        error:
          error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Server error',
      error:
        error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL USER FARMS
|--------------------------------------------------------------------------
|
| GET /api/field/user/:userId
|
*/

export const getUserFields =
  async (
    req,
    res,
  ) => {
    try {
      const {userId} =
        req.params;

      if (
        !isValidUserId(
          userId,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid User ID',
        });
      }

      const user =
        await User.findById(
          userId,
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'User not found',
        });
      }

      const farms =
        await FarmField.find({
          user: userId,
        })
          .sort({
            createdAt: -1,
          })
          .lean();

      return res.status(200).json({
        success: true,

        count:
          farms.length,

        farms,
      });
    } catch (error) {
      console.error(
        'Error fetching user farms:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          'Server error',
        error:
          error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET SINGLE FARM
|--------------------------------------------------------------------------
|
| GET /api/field/:fieldId
|
*/

export const getField =
  async (
    req,
    res,
  ) => {
    try {
      const {fieldId} =
        req.params;

      if (
        !isValidFieldId(
          fieldId,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid farm field ID',
        });
      }

      const farmField =
        await FarmField.findById(
          fieldId,
        ).lean();

      if (!farmField) {
        return res.status(404).json({
          success: false,
          message:
            'Farm field not found',
        });
      }

      return res.status(200).json({
        success: true,

        farmField,
      });
    } catch (error) {
      console.error(
        'Error fetching farm field:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          'Server error',
        error:
          error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| UPDATE FARM FIELD
|--------------------------------------------------------------------------
|
| PUT /api/field/:fieldId
|
*/

export const updateField =
  async (
    req,
    res,
  ) => {
    try {
      const {fieldId} =
        req.params;

      const {
        latlng,
        cropName,
        cropImage,
        variety,
        sowingDate,
        typeOfIrrigation,
        farmName,
        acre,
        typeOfFarming,
        isBarrenLand,
      } = req.body;

      /*
      |--------------------------------------------------------------------------
      | FIELD ID
      |--------------------------------------------------------------------------
      */

      if (
        !isValidFieldId(
          fieldId,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid farm field ID',
        });
      }

      /*
      |--------------------------------------------------------------------------
      | FIND FARM
      |--------------------------------------------------------------------------
      */

      const farmField =
        await FarmField.findById(
          fieldId,
        );

      if (!farmField) {
        return res.status(404).json({
          success: false,
          message:
            'Farm field not found',
        });
      }

      /*
      |--------------------------------------------------------------------------
      | COORDINATES
      |--------------------------------------------------------------------------
      */

      if (
        latlng !== undefined
      ) {
        if (
          !validateCoordinates(
            latlng,
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid field coordinates. At least 3 valid points are required.',
          });
        }

        farmField.field =
          normalizeCoordinates(
            latlng,
          );
      }

      /*
      |--------------------------------------------------------------------------
      | CROP NAME
      |--------------------------------------------------------------------------
      */

      if (
        cropName !== undefined
      ) {
        const value =
          String(
            cropName,
          ).trim();

        if (!value) {
          return res.status(400).json({
            success: false,
            message:
              'cropName cannot be empty',
          });
        }

        farmField.cropName =
          value;
      }

      /*
      |--------------------------------------------------------------------------
      | CROP IMAGE
      |--------------------------------------------------------------------------
      */

      if (
        cropImage !== undefined
      ) {
        farmField.cropImage =
          normalizeCropImage(
            cropImage,
          );
      }

      /*
      |--------------------------------------------------------------------------
      | VARIETY
      |--------------------------------------------------------------------------
      */

      if (
        variety !== undefined
      ) {
        const value =
          String(
            variety,
          ).trim();

        if (!value) {
          return res.status(400).json({
            success: false,
            message:
              'variety cannot be empty',
          });
        }

        farmField.variety =
          value;
      }

      /*
      |--------------------------------------------------------------------------
      | SOWING DATE
      |--------------------------------------------------------------------------
      */

      if (
        sowingDate !== undefined
      ) {
        const value =
          String(
            sowingDate,
          ).trim();

        if (!value) {
          return res.status(400).json({
            success: false,
            message:
              'sowingDate cannot be empty',
          });
        }

        farmField.sowingDate =
          value;
      }

      /*
      |--------------------------------------------------------------------------
      | IRRIGATION
      |--------------------------------------------------------------------------
      */

      if (
        typeOfIrrigation !==
        undefined
      ) {
        const value =
          String(
            typeOfIrrigation,
          ).trim();

        if (!value) {
          return res.status(400).json({
            success: false,
            message:
              'typeOfIrrigation cannot be empty',
          });
        }

        farmField.typeOfIrrigation =
          value;
      }

      /*
      |--------------------------------------------------------------------------
      | FARM NAME
      |--------------------------------------------------------------------------
      */

      if (
        farmName !== undefined
      ) {
        const value =
          String(
            farmName,
          ).trim();

        if (!value) {
          return res.status(400).json({
            success: false,
            message:
              'farmName cannot be empty',
          });
        }

        farmField.fieldName =
          value;
      }

      /*
      |--------------------------------------------------------------------------
      | AREA
      |--------------------------------------------------------------------------
      */

      if (
        acre !== undefined
      ) {
        const numericAcre =
          Number(acre);

        if (
          !Number.isFinite(
            numericAcre,
          ) ||
          numericAcre <= 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              'acre must be a valid number greater than 0',
          });
        }

        farmField.acre =
          numericAcre;
      }

      /*
      |--------------------------------------------------------------------------
      | FARMING TYPE
      |--------------------------------------------------------------------------
      */

      if (
        typeOfFarming !==
        undefined
      ) {
        if (
          !ALLOWED_FARMING_TYPES.includes(
            typeOfFarming,
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              'typeOfFarming must be Organic, Inorganic, or Integrated',
          });
        }

        farmField.typeOfFarming =
          typeOfFarming;
      }

      /*
      |--------------------------------------------------------------------------
      | BARREN LAND
      |--------------------------------------------------------------------------
      */

      if (
        isBarrenLand !==
        undefined
      ) {
        farmField.isBarrenLand =
          Boolean(
            isBarrenLand,
          );
      }

      /*
      |--------------------------------------------------------------------------
      | SAVE
      |--------------------------------------------------------------------------
      */

      const updatedFarm =
        await farmField.save();

      console.log(
        'Updated crop image:',
        updatedFarm.cropImage,
      );

      return res.status(200).json({
        success: true,

        message:
          'Farm field updated successfully.',

        farmField:
          updatedFarm,
      });
    } catch (error) {
      console.error(
        'Error updating farm field:',
        error,
      );

      if (
        error.name ===
        'ValidationError'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Validation error',
          error:
            error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message:
          'Server error',
        error:
          error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| DELETE FARM FIELD
|--------------------------------------------------------------------------
|
| DELETE /api/field/:fieldId
|
*/

export const deleteField =
  async (
    req,
    res,
  ) => {
    try {
      const {fieldId} =
        req.params;

      if (
        !isValidFieldId(
          fieldId,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid farm field ID',
        });
      }

      const deletedFarm =
        await FarmField.findByIdAndDelete(
          fieldId,
        );

      if (!deletedFarm) {
        return res.status(404).json({
          success: false,
          message:
            'Farm field not found',
        });
      }

      return res.status(200).json({
        success: true,

        message:
          'Farm field deleted successfully.',

        farmField:
          deletedFarm,
      });
    } catch (error) {
      console.error(
        'Error deleting farm field:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          'Server error',
        error:
          error.message,
      });
    }
  };