import mongoose from 'mongoose';
import Doctor from '../models/Doctor.js';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getAuthenticatedUserId = req => {
  return req.user?.userId || req.user?.id || req.user?._id;
};

const normalizeArray = value => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
};

const isValidObjectId = id => {
  return mongoose.Types.ObjectId.isValid(id);
};

const getErrorMessage = error => {
  return (
    error?.message ||
    'Something went wrong'
  );
};

/*
|--------------------------------------------------------------------------
| CREATE DOCTOR
|--------------------------------------------------------------------------
| POST /api/doctors
|--------------------------------------------------------------------------
*/

export const createDoctor = async (
  req,
  res,
) => {
  try {
    const userId =
      getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user id',
      });
    }

    const {
      fullName,
      profileImage,
      phoneNumber,
      email,
      doctorType,
      specialization,
      qualification,
      doctorateCertificate,
      languages,
      about,
      consultationFee,
      consultationFeeType,
      availability,
      availableFrom,
      availableUntil,
      state,
      district,
      village,
      address,
      profileCompleted,
    } = req.body;

    /*
    |--------------------------------------------------------------------------
    | REQUIRED FIELDS
    |--------------------------------------------------------------------------
    */

    if (
      !fullName ||
      !String(fullName).trim()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Full name is required',
      });
    }

    if (
      !doctorType ||
      ![
        'veterinarian',
        'agriculturalDoctor',
      ].includes(doctorType)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid doctor type is required',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | DUPLICATE DOCTOR PROFILE
    |--------------------------------------------------------------------------
    */

    const existingDoctor =
      await Doctor.findOne({
        user: userId,
      });

    if (existingDoctor) {
      return res.status(409).json({
        success: false,
        message:
          'You already have a doctor profile',
        doctor: existingDoctor,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FEE
    |--------------------------------------------------------------------------
    */

    let fee = 0;

    if (
      consultationFee !==
        undefined &&
      consultationFee !== null &&
      consultationFee !== ''
    ) {
      fee = Number(
        consultationFee,
      );

      if (
        Number.isNaN(fee) ||
        fee < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Consultation fee must be a valid positive number',
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | CREATE
    |--------------------------------------------------------------------------
    */

    const doctor =
      await Doctor.create({
        user: userId,

        fullName:
          String(fullName).trim(),

        profileImage:
          profileImage || '',

        phoneNumber:
          phoneNumber || '',

        email:
          email || '',

        doctorType,

        specialization:
          normalizeArray(
            specialization,
          ),

        qualification:
          normalizeArray(
            qualification,
          ),

        doctorateCertificate:
          doctorateCertificate || '',

        languages:
          normalizeArray(
            languages,
          ),

        about:
          about || '',

        consultationFee:
          fee,

        consultationFeeType:
          consultationFeeType ===
          'free'
            ? 'free'
            : 'perConsultation',

        availability:
          availability || 'available',

        availableFrom:
          availableFrom
            ? new Date(
                availableFrom,
              )
            : null,

        availableUntil:
          availableUntil
            ? new Date(
                availableUntil,
              )
            : null,

        state:
          state || '',

        district:
          district || '',

        village:
          village || '',

        address:
          address || '',

        isActive: true,

        profileCompleted:
          profileCompleted !==
          undefined
            ? Boolean(
                profileCompleted,
              )
            : true,
      });

    return res.status(201).json({
      success: true,
      message:
        'Doctor profile created successfully',
      doctor,
    });
  } catch (error) {
    console.error(
      'createDoctor error:',
      error,
    );

    /*
    |--------------------------------------------------------------------------
    | DUPLICATE KEY
    |--------------------------------------------------------------------------
    */

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          'You already have a doctor profile',
      });
    }

    return res.status(500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL ACTIVE DOCTORS
|--------------------------------------------------------------------------
| GET /api/doctors
|--------------------------------------------------------------------------
*/

export const getAllDoctors = async (
  req,
  res,
) => {
  try {
    const {
      search = '',
      doctorType,
      specialization,
      state,
      district,
      availability,
      minFee,
      maxFee,
      page = 1,
      limit = 20,
    } = req.query;

    const currentUserId =
      getAuthenticatedUserId(req);

    const pageNumber = Math.max(
      Number(page) || 1,
      1,
    );

    const limitNumber = Math.min(
      Math.max(
        Number(limit) || 20,
        1,
      ),
      100,
    );

    const skip =
      (pageNumber - 1) *
      limitNumber;

    const query = {
      isActive: true,
    };

    /*
    |--------------------------------------------------------------------------
    | EXCLUDE CURRENT USER
    |--------------------------------------------------------------------------
    */

    if (
      currentUserId &&
      isValidObjectId(
        currentUserId,
      )
    ) {
      query.user = {
        $ne: new mongoose.Types.ObjectId(
          currentUserId,
        ),
      };
    }

    /*
    |--------------------------------------------------------------------------
    | AVAILABILITY
    |--------------------------------------------------------------------------
    */

    if (availability) {
      query.availability =
        availability;
    } else {
      query.availability =
        'available';
    }

    /*
    |--------------------------------------------------------------------------
    | DOCTOR TYPE
    |--------------------------------------------------------------------------
    */

    if (
      doctorType &&
      [
        'veterinarian',
        'agriculturalDoctor',
      ].includes(doctorType)
    ) {
      query.doctorType =
        doctorType;
    }

    /*
    |--------------------------------------------------------------------------
    | SPECIALIZATION
    |--------------------------------------------------------------------------
    */

    if (specialization) {
      query.specialization = {
        $regex:
          String(
            specialization,
          ),
        $options: 'i',
      };
    }

    /*
    |--------------------------------------------------------------------------
    | LOCATION
    |--------------------------------------------------------------------------
    */

    if (state) {
      query.state = {
        $regex:
          String(state),
        $options: 'i',
      };
    }

    if (district) {
      query.district = {
        $regex:
          String(district),
        $options: 'i',
      };
    }

    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    if (
      search &&
      String(search).trim()
    ) {
      const searchRegex = {
        $regex:
          String(search).trim(),
        $options: 'i',
      };

      query.$or = [
        {
          fullName:
            searchRegex,
        },
        {
          specialization:
            searchRegex,
        },
        {
          qualification:
            searchRegex,
        },
        {
          about:
            searchRegex,
        },
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | FEE
    |--------------------------------------------------------------------------
    */

    if (
      minFee !== undefined
    ) {
      query.consultationFee = {
        ...(query.consultationFee ||
          {}),
        $gte:
          Number(minFee) || 0,
      };
    }

    if (
      maxFee !== undefined
    ) {
      query.consultationFee = {
        ...(query.consultationFee ||
          {}),
        $lte:
          Number(maxFee),
      };
    }

    /*
    |--------------------------------------------------------------------------
    | FETCH
    |--------------------------------------------------------------------------
    */

    const [
      doctors,
      total,
    ] = await Promise.all([
      Doctor.find(query)
        .sort({
          rating: -1,
          totalReviews: -1,
          totalConsultations: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      Doctor.countDocuments(
        query,
      ),
    ]);

    return res.status(200).json({
      success: true,
      doctors,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages:
          Math.ceil(
            total /
              limitNumber,
          ),
      },
    });
  } catch (error) {
    console.error(
      'getAllDoctors error:',
      error,
    );

    return res.status(500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY DOCTOR PROFILE
|--------------------------------------------------------------------------
| GET /api/doctors/my-profile
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| This endpoint does NOT accept a doctor ID.
|
| It finds the Doctor document through:
|
| req.user.userId
|       ↓
| Doctor.user
|
|--------------------------------------------------------------------------
*/

export const getMyDoctorProfile =
  async (
    req,
    res,
  ) => {
    try {
      const userId =
        getAuthenticatedUserId(
          req,
        );

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authentication required',
        });
      }

      if (
        !isValidObjectId(
          userId,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid user id',
        });
      }

      const doctor =
        await Doctor.findOne({
          user: userId,
        }).lean();

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message:
            'Doctor profile not found',
        });
      }

      return res.status(200).json({
        success: true,
        doctor,
      });
    } catch (error) {
      console.error(
        'getMyDoctorProfile error:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          getErrorMessage(error),
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET DOCTOR BY DOCTOR ID
|--------------------------------------------------------------------------
| GET /api/doctors/:id
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| This endpoint DOES require Doctor._id.
|
|--------------------------------------------------------------------------
*/

export const getDoctorById =
  async (
    req,
    res,
  ) => {
    try {
      const { id } =
        req.params;

      if (
        !id ||
        !isValidObjectId(id)
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid doctor id',
        });
      }

      const doctor =
        await Doctor.findOne({
          _id: id,
          isActive: true,
        }).lean();

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message:
            'Doctor not found',
        });
      }

      return res.status(200).json({
        success: true,
        doctor,
      });
    } catch (error) {
      console.error(
        'getDoctorById error:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          getErrorMessage(error),
      });
    }
  };

/*
|--------------------------------------------------------------------------
| UPDATE MY DOCTOR PROFILE
|--------------------------------------------------------------------------
| PATCH /api/doctors/my-profile
|--------------------------------------------------------------------------
*/

export const updateMyDoctorProfile =
  async (
    req,
    res,
  ) => {
    try {
      const userId =
        getAuthenticatedUserId(
          req,
        );

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authentication required',
        });
      }

      if (
        !isValidObjectId(
          userId,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid user id',
        });
      }

      const allowedFields = [
        'fullName',
        'profileImage',
        'phoneNumber',
        'email',
        'doctorType',
        'specialization',
        'qualification',
        'doctorateCertificate',
        'languages',
        'about',
        'consultationFee',
        'consultationFeeType',
        'availability',
        'availableFrom',
        'availableUntil',
        'state',
        'district',
        'village',
        'address',
        'profileCompleted',
      ];

      const update = {};

      allowedFields.forEach(
        field => {
          if (
            req.body[field] !==
            undefined
          ) {
            update[field] =
              req.body[field];
          }
        },
      );

      /*
      |--------------------------------------------------------------------------
      | NORMALIZE ARRAYS
      |--------------------------------------------------------------------------
      */

      if (
        update.specialization !==
        undefined
      ) {
        update.specialization =
          normalizeArray(
            update.specialization,
          );
      }

      if (
        update.qualification !==
        undefined
      ) {
        update.qualification =
          normalizeArray(
            update.qualification,
          );
      }

      if (
        update.languages !==
        undefined
      ) {
        update.languages =
          normalizeArray(
            update.languages,
          );
      }

      /*
      |--------------------------------------------------------------------------
      | VALIDATE TYPE
      |--------------------------------------------------------------------------
      */

      if (
        update.doctorType !==
          undefined &&
        ![
          'veterinarian',
          'agriculturalDoctor',
        ].includes(
          update.doctorType,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid doctor type',
        });
      }

      /*
      |--------------------------------------------------------------------------
      | VALIDATE FEE
      |--------------------------------------------------------------------------
      */

      if (
        update.consultationFee !==
        undefined
      ) {
        const fee = Number(
          update.consultationFee,
        );

        if (
          Number.isNaN(fee) ||
          fee < 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid consultation fee',
          });
        }

        update.consultationFee =
          fee;
      }

      /*
      |--------------------------------------------------------------------------
      | DATE CONVERSION
      |--------------------------------------------------------------------------
      */

      if (
        update.availableFrom
      ) {
        update.availableFrom =
          new Date(
            update.availableFrom,
          );
      }

      if (
        update.availableUntil
      ) {
        update.availableUntil =
          new Date(
            update.availableUntil,
          );
      }

      const doctor =
        await Doctor.findOneAndUpdate(
          {
            user: userId,
          },
          {
            $set: update,
          },
          {
            new: true,
            runValidators: true,
          },
        );

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message:
            'Doctor profile not found',
        });
      }

      return res.status(200).json({
        success: true,
        message:
          'Doctor profile updated successfully',
        doctor,
      });
    } catch (error) {
      console.error(
        'updateMyDoctorProfile error:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          getErrorMessage(error),
      });
    }
  };

/*
|--------------------------------------------------------------------------
| DEACTIVATE
|--------------------------------------------------------------------------
| PATCH /api/doctors/deactivate
|--------------------------------------------------------------------------
*/

export const deactivateMyDoctorProfile =
  async (
    req,
    res,
  ) => {
    try {
      const userId =
        getAuthenticatedUserId(
          req,
        );

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authentication required',
        });
      }

      const doctor =
        await Doctor.findOneAndUpdate(
          {
            user: userId,
          },
          {
            $set: {
              isActive: false,
              availability:
                'unavailable',
            },
          },
          {
            new: true,
          },
        );

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message:
            'Doctor profile not found',
        });
      }

      return res.status(200).json({
        success: true,
        message:
          'Doctor profile deactivated successfully',
        doctor,
      });
    } catch (error) {
      console.error(
        'deactivateMyDoctorProfile error:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          getErrorMessage(error),
      });
    }
  };

/*
|--------------------------------------------------------------------------
| ACTIVATE
|--------------------------------------------------------------------------
| PATCH /api/doctors/activate
|--------------------------------------------------------------------------
*/

export const activateMyDoctorProfile =
  async (
    req,
    res,
  ) => {
    try {
      const userId =
        getAuthenticatedUserId(
          req,
        );

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authentication required',
        });
      }

      const doctor =
        await Doctor.findOneAndUpdate(
          {
            user: userId,
          },
          {
            $set: {
              isActive: true,
              availability:
                'available',
            },
          },
          {
            new: true,
          },
        );

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message:
            'Doctor profile not found',
        });
      }

      return res.status(200).json({
        success: true,
        message:
          'Doctor profile activated successfully',
        doctor,
      });
    } catch (error) {
      console.error(
        'activateMyDoctorProfile error:',
        error,
      );

      return res.status(500).json({
        success: false,
        message:
          getErrorMessage(error),
      });
    }
  };