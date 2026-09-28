import mongoose from 'mongoose';

import FarmField from '../models/farmField.model.js';
import User from '../models/User.js';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const ALLOWED_FARMING_TYPES = [
  'Organic',
  'Inorganic',
  'Integrated',
];

/*
|--------------------------------------------------------------------------
| VALIDATE USER ID
|--------------------------------------------------------------------------
*/

const isValidUserId = userId => {
  return mongoose.Types.ObjectId.isValid(
    userId,
  );
};

/*
|--------------------------------------------------------------------------
| VALIDATE FIELD COORDINATES
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| NORMALIZE COORDINATES
|--------------------------------------------------------------------------
*/

const normalizeCoordinates = latlng => {
  return latlng.map(point => ({
    lat: Number(point.lat),
    lng: Number(point.lng),
  }));
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
    const {userId} =
      req.params;

    const {
      latlng,
      cropName,
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
    | USER ID
    |--------------------------------------------------------------------------
    */

    if (!isValidUserId(userId)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid User ID',
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

    /*
    |--------------------------------------------------------------------------
    | CREATE
    |--------------------------------------------------------------------------
    */

    const newFarmField =
      new FarmField({
        field:
          normalizeCoordinates(
            latlng,
          ),

        user: userId,

        cropName:
          cropName.trim(),

        variety:
          variety.trim(),

        sowingDate:
          sowingDate.trim(),

        typeOfIrrigation:
          typeOfIrrigation.trim(),

        fieldName:
          farmName.trim(),

        acre:
          numericAcre,

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
| GET ALL FARMS BY USER
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

      /*
      |--------------------------------------------------------------------------
      | USER ID
      |--------------------------------------------------------------------------
      */

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

      /*
      |--------------------------------------------------------------------------
      | USER EXISTS
      |--------------------------------------------------------------------------
      */

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

      /*
      |--------------------------------------------------------------------------
      | GET FARMS
      |--------------------------------------------------------------------------
      */

      const farms =
        await FarmField.find({
          user: userId,
        })
          .sort({
            createdAt: -1,
          })
          .lean();

      /*
      |--------------------------------------------------------------------------
      | RESPONSE
      |--------------------------------------------------------------------------
      */

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

      /*
      |--------------------------------------------------------------------------
      | FIELD ID
      |--------------------------------------------------------------------------
      */

      if (
        !mongoose.Types.ObjectId.isValid(
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
      | FIND
      |--------------------------------------------------------------------------
      */

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

      /*
      |--------------------------------------------------------------------------
      | RESPONSE
      |--------------------------------------------------------------------------
      */

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
        !mongoose.Types.ObjectId.isValid(
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
      | UPDATE ONLY PROVIDED FIELDS
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

      if (
        cropName !==
        undefined
      ) {
        if (
          !String(
            cropName,
          ).trim()
        ) {
          return res.status(400).json({
            success: false,
            message:
              'cropName cannot be empty',
          });
        }

        farmField.cropName =
          String(
            cropName,
          ).trim();
      }

      if (
        variety !==
        undefined
      ) {
        if (
          !String(
            variety,
          ).trim()
        ) {
          return res.status(400).json({
            success: false,
            message:
              'variety cannot be empty',
          });
        }

        farmField.variety =
          String(
            variety,
          ).trim();
      }

      if (
        sowingDate !==
        undefined
      ) {
        if (
          !String(
            sowingDate,
          ).trim()
        ) {
          return res.status(400).json({
            success: false,
            message:
              'sowingDate cannot be empty',
          });
        }

        farmField.sowingDate =
          String(
            sowingDate,
          ).trim();
      }

      if (
        typeOfIrrigation !==
        undefined
      ) {
        if (
          !String(
            typeOfIrrigation,
          ).trim()
        ) {
          return res.status(400).json({
            success: false,
            message:
              'typeOfIrrigation cannot be empty',
          });
        }

        farmField.typeOfIrrigation =
          String(
            typeOfIrrigation,
          ).trim();
      }

      if (
        farmName !==
        undefined
      ) {
        if (
          !String(
            farmName,
          ).trim()
        ) {
          return res.status(400).json({
            success: false,
            message:
              'farmName cannot be empty',
          });
        }

        farmField.fieldName =
          String(
            farmName,
          ).trim();
      }

      if (
        acre !==
        undefined
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

      /*
      |--------------------------------------------------------------------------
      | RESPONSE
      |--------------------------------------------------------------------------
      */

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

      /*
      |--------------------------------------------------------------------------
      | FIELD ID
      |--------------------------------------------------------------------------
      */

      if (
        !mongoose.Types.ObjectId.isValid(
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
      | DELETE
      |--------------------------------------------------------------------------
      */

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

      /*
      |--------------------------------------------------------------------------
      | RESPONSE
      |--------------------------------------------------------------------------
      */

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