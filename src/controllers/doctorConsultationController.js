import mongoose from 'mongoose';

import DoctorConsultation from '../models/DoctorConsultation.js';
import Doctor from '../models/Doctor.js';

const isValidObjectId = (id) => {
  return id && mongoose.Types.ObjectId.isValid(id);
};

const getAuthenticatedUserId = (req) => {
  return req.user?.userId;
};

/*
|--------------------------------------------------------------------------
| POPULATE CONSULTATION
|--------------------------------------------------------------------------
*/

const populateConsultation = (query) => {
  return query
    .populate(
      'doctor',
      'fullName profileImage phoneNumber email doctorType specialization qualification doctorateCertificate languages about consultationFee consultationFeeType availability state district village address isVerified verificationStatus rating totalReviews totalConsultations'
    )
    .populate(
      'farmer',
      'fullName email phoneNumber state district village'
    );
};

/*
|--------------------------------------------------------------------------
| CREATE CONSULTATION
|--------------------------------------------------------------------------
*/

export const createDoctorConsultation =
  async (req, res) => {
    try {
      const farmerId =
        getAuthenticatedUserId(req);

      if (!farmerId) {
        return res.status(401).json({
          success: false,
          message:
            'Authenticated user not found',
        });
      }

      if (!isValidObjectId(farmerId)) {
        return res.status(401).json({
          success: false,
          message:
            'Invalid authenticated user ID',
        });
      }

      const {
        doctorId,
        consultationDate,
        startTime,
        endTime,
        consultationType,
        problemType,
        animalType,
        animalCount,
        animalAge,
        symptoms,
        description,
        state,
        district,
        village,
        address,
        consultationFee,
        totalAmount,
        paymentMethod,
        farmerNotes,
      } = req.body;

      if (!doctorId) {
        return res.status(400).json({
          success: false,
          message: 'Doctor ID is required',
        });
      }

      if (!isValidObjectId(doctorId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid doctor ID',
        });
      }

      if (!consultationDate) {
        return res.status(400).json({
          success: false,
          message:
            'Consultation date is required',
        });
      }

      if (!startTime) {
        return res.status(400).json({
          success: false,
          message: 'Start time is required',
        });
      }

      if (!consultationType) {
        return res.status(400).json({
          success: false,
          message:
            'Consultation type is required',
        });
      }

      if (
        !['veterinary', 'agricultural'].includes(
          consultationType
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid consultation type',
        });
      }

      const doctor =
        await Doctor.findOne({
          _id: doctorId,
          isActive: true,
        });

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message:
            'Doctor not found or unavailable',
        });
      }

      if (
        doctor.user &&
        String(doctor.user) ===
          String(farmerId)
      ) {
        return res.status(400).json({
          success: false,
          message:
            'You cannot request consultation from your own doctor profile',
        });
      }

      if (
        doctor.availability !==
        'available'
      ) {
        return res.status(409).json({
          success: false,
          message:
            'This doctor is currently unavailable',
        });
      }

      /*
       * Make sure doctor type matches
       * consultation type.
       */
      if (
        doctor.doctorType ===
          'veterinarian' &&
        consultationType !==
          'veterinary'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'This doctor only provides veterinary consultations',
        });
      }

      if (
        doctor.doctorType ===
          'agriculturalDoctor' &&
        consultationType !==
          'agricultural'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'This doctor only provides agricultural consultations',
        });
      }

      /*
       * Prevent duplicate active
       * consultation requests for the
       * same farmer, doctor and date.
       */
      const existingConsultation =
        await DoctorConsultation.findOne({
          farmer: farmerId,
          doctor: doctorId,
          consultationDate:
            new Date(consultationDate),
          status: {
            $in: [
              'pending',
              'confirmed',
              'accepted',
            ],
          },
        });

      if (existingConsultation) {
        return res.status(409).json({
          success: false,
          message:
            'You already have a consultation with this doctor for this date',
          consultation:
            existingConsultation,
        });
      }

      const finalFee =
        consultationFee !==
          undefined &&
        consultationFee !== null &&
        consultationFee !== ''
          ? Number(consultationFee)
          : Number(
              doctor.consultationFee || 0
            );

      const finalTotal =
        totalAmount !== undefined &&
        totalAmount !== null &&
        totalAmount !== ''
          ? Number(totalAmount)
          : finalFee;

      const consultation =
        await DoctorConsultation.create({
          farmer: farmerId,

          doctor: doctorId,

          consultationDate:
            new Date(consultationDate),

          startTime: String(startTime),

          endTime: endTime
            ? String(endTime)
            : '',

          consultationType,

          problemType:
            problemType || '',

          animalType:
            animalType || '',

          animalCount:
            animalCount !== undefined &&
            animalCount !== null &&
            animalCount !== ''
              ? Number(animalCount)
              : 0,

          animalAge:
            animalAge || '',

          symptoms:
            symptoms || '',

          description:
            description || '',

          state:
            state || doctor.state || '',

          district:
            district ||
            doctor.district ||
            '',

          village:
            village ||
            doctor.village ||
            '',

          address:
            address || '',

          consultationFee:
            finalFee,

          totalAmount:
            finalTotal,

          paymentMethod:
            paymentMethod || 'cod',

          farmerNotes:
            farmerNotes || '',

          status: 'pending',
        });

      const populated =
        await populateConsultation(
          DoctorConsultation.findById(
            consultation._id
          )
        );

      return res.status(201).json({
        success: true,
        message:
          'Doctor consultation request created successfully',
        consultation: populated,
      });
    } catch (error) {
      console.error(
        'Create doctor consultation error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to create doctor consultation',
        error: error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET MY CONSULTATIONS - FARMER
|--------------------------------------------------------------------------
*/

export const getMyConsultations =
  async (req, res) => {
    try {
      const farmerId =
        getAuthenticatedUserId(req);

      if (!farmerId) {
        return res.status(401).json({
          success: false,
          message:
            'Authenticated user not found',
        });
      }

      if (!isValidObjectId(farmerId)) {
        return res.status(401).json({
          success: false,
          message:
            'Invalid authenticated user ID',
        });
      }

      const {
        status,
        page = 1,
        limit = 20,
      } = req.query;

      const filters = {
        farmer: farmerId,
      };

      if (status) {
        filters.status = status;
      }

      const currentPage = Math.max(
        Number(page) || 1,
        1
      );

      const perPage = Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );

      const skip =
        (currentPage - 1) *
        perPage;

      const [
        consultations,
        total,
      ] = await Promise.all([
        populateConsultation(
          DoctorConsultation.find(
            filters
          )
        )
          .sort({
            consultationDate: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(perPage)
          .lean(),

        DoctorConsultation.countDocuments(
          filters
        ),
      ]);

      const totalPages =
        Math.ceil(
          total / perPage
        );

      return res.status(200).json({
        success: true,
        message:
          'Consultations fetched successfully',

        count:
          consultations.length,

        total,

        pagination: {
          currentPage,
          limit: perPage,
          totalPages,
          hasNextPage:
            currentPage <
            totalPages,
          hasPreviousPage:
            currentPage > 1,
        },

        consultations,
      });
    } catch (error) {
      console.error(
        'Get my consultations error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to fetch consultations',
        error: error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET DOCTOR REQUESTS
|--------------------------------------------------------------------------
*/

export const getDoctorRequests =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authenticated user not found',
        });
      }

      const doctor =
        await Doctor.findOne({
          user: userId,
        }).select('_id');

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message:
            'Doctor profile not found',
        });
      }

      const {
        status,
        page = 1,
        limit = 20,
      } = req.query;

      const filters = {
        doctor: doctor._id,
      };

      if (status) {
        filters.status = status;
      }

      const currentPage = Math.max(
        Number(page) || 1,
        1
      );

      const perPage = Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );

      const skip =
        (currentPage - 1) *
        perPage;

      const [
        consultations,
        total,
      ] = await Promise.all([
        populateConsultation(
          DoctorConsultation.find(
            filters
          )
        )
          .sort({
            consultationDate: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(perPage)
          .lean(),

        DoctorConsultation.countDocuments(
          filters
        ),
      ]);

      const totalPages =
        Math.ceil(
          total / perPage
        );

      return res.status(200).json({
        success: true,
        message:
          'Doctor consultation requests fetched successfully',

        count:
          consultations.length,

        total,

        pagination: {
          currentPage,
          limit: perPage,
          totalPages,
          hasNextPage:
            currentPage <
            totalPages,
          hasPreviousPage:
            currentPage > 1,
        },

        consultations,
      });
    } catch (error) {
      console.error(
        'Get doctor requests error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to fetch doctor requests',
        error: error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| GET CONSULTATION BY ID
|--------------------------------------------------------------------------
*/

export const getConsultationById =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authenticated user not found',
        });
      }

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid consultation ID',
        });
      }

      const consultation =
        await populateConsultation(
          DoctorConsultation.findById(id)
        );

      if (!consultation) {
        return res.status(404).json({
          success: false,
          message:
            'Consultation not found',
        });
      }

      const doctor =
        await Doctor.findById(
          consultation.doctor?._id
        ).select('user');

      const isFarmer =
        String(
          consultation.farmer?._id
        ) === String(userId);

      const isDoctor =
        doctor &&
        String(doctor.user) ===
          String(userId);

      if (!isFarmer && !isDoctor) {
        return res.status(403).json({
          success: false,
          message:
            'You are not authorized to view this consultation',
        });
      }

      return res.status(200).json({
        success: true,
        consultation,
      });
    } catch (error) {
      console.error(
        'Get consultation by ID error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to fetch consultation',
        error: error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| ACCEPT CONSULTATION
|--------------------------------------------------------------------------
*/

export const acceptConsultation =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authenticated user not found',
        });
      }

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid consultation ID',
        });
      }

      const consultation =
        await DoctorConsultation.findById(
          id
        ).populate('doctor');

      if (!consultation) {
        return res.status(404).json({
          success: false,
          message:
            'Consultation not found',
        });
      }

      if (
        !consultation.doctor ||
        String(
          consultation.doctor.user
        ) !== String(userId)
      ) {
        return res.status(403).json({
          success: false,
          message:
            'You are not authorized to accept this consultation',
        });
      }

      if (
        consultation.status !==
        'pending'
      ) {
        return res.status(400).json({
          success: false,
          message: `Consultation is already ${consultation.status}`,
        });
      }

      consultation.status =
        'accepted';

      await consultation.save();

      return res.status(200).json({
        success: true,
        message:
          'Consultation accepted successfully',
        consultation,
      });
    } catch (error) {
      console.error(
        'Accept consultation error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to accept consultation',
        error: error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| REJECT CONSULTATION
|--------------------------------------------------------------------------
*/

export const rejectConsultation =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authenticated user not found',
        });
      }

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid consultation ID',
        });
      }

      const consultation =
        await DoctorConsultation.findById(
          id
        ).populate('doctor');

      if (!consultation) {
        return res.status(404).json({
          success: false,
          message:
            'Consultation not found',
        });
      }

      if (
        !consultation.doctor ||
        String(
          consultation.doctor.user
        ) !== String(userId)
      ) {
        return res.status(403).json({
          success: false,
          message:
            'You are not authorized to reject this consultation',
        });
      }

      if (
        consultation.status !==
        'pending'
      ) {
        return res.status(400).json({
          success: false,
          message: `Consultation is already ${consultation.status}`,
        });
      }

      const {
        reason = '',
      } = req.body || {};

      consultation.status =
        'rejected';

      consultation.cancellationReason =
        reason;

      await consultation.save();

      return res.status(200).json({
        success: true,
        message:
          'Consultation rejected successfully',
        consultation,
      });
    } catch (error) {
      console.error(
        'Reject consultation error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to reject consultation',
        error: error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| CANCEL CONSULTATION
|--------------------------------------------------------------------------
*/

export const cancelConsultation =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authenticated user not found',
        });
      }

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid consultation ID',
        });
      }

      const consultation =
        await DoctorConsultation.findById(
          id
        ).populate('doctor');

      if (!consultation) {
        return res.status(404).json({
          success: false,
          message:
            'Consultation not found',
        });
      }

      const isFarmer =
        String(
          consultation.farmer
        ) === String(userId);

      const isDoctor =
        consultation.doctor &&
        String(
          consultation.doctor.user
        ) === String(userId);

      if (!isFarmer && !isDoctor) {
        return res.status(403).json({
          success: false,
          message:
            'You are not authorized to cancel this consultation',
        });
      }

      if (
        [
          'cancelled',
          'completed',
          'rejected',
        ].includes(
          consultation.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message: `Consultation cannot be cancelled because it is already ${consultation.status}`,
        });
      }

      const {
        reason = '',
      } = req.body || {};

      consultation.status =
        'cancelled';

      consultation.cancellationReason =
        reason;

      await consultation.save();

      return res.status(200).json({
        success: true,
        message:
          'Consultation cancelled successfully',
        consultation,
      });
    } catch (error) {
      console.error(
        'Cancel consultation error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to cancel consultation',
        error: error.message,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| COMPLETE CONSULTATION
|--------------------------------------------------------------------------
*/

export const completeConsultation =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            'Authenticated user not found',
        });
      }

      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid consultation ID',
        });
      }

      const {
        doctorNotes,
        diagnosis,
        prescription,
      } = req.body || {};

      const consultation =
        await DoctorConsultation.findById(
          id
        ).populate('doctor');

      if (!consultation) {
        return res.status(404).json({
          success: false,
          message:
            'Consultation not found',
        });
      }

      const isFarmer =
        String(
          consultation.farmer
        ) === String(userId);

      const isDoctor =
        consultation.doctor &&
        String(
          consultation.doctor.user
        ) === String(userId);

      if (!isFarmer && !isDoctor) {
        return res.status(403).json({
          success: false,
          message:
            'You are not authorized to complete this consultation',
        });
      }

      if (
        !['accepted', 'confirmed'].includes(
          consultation.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Only accepted or confirmed consultations can be completed',
        });
      }

      if (
        isDoctor &&
        doctorNotes !== undefined
      ) {
        consultation.doctorNotes =
          doctorNotes;
      }

      if (
        isDoctor &&
        diagnosis !== undefined
      ) {
        consultation.diagnosis =
          diagnosis;
      }

      if (
        isDoctor &&
        prescription !== undefined
      ) {
        consultation.prescription =
          prescription;
      }

      consultation.status =
        'completed';

      await consultation.save();

      await Doctor.findByIdAndUpdate(
        consultation.doctor._id,
        {
          $inc: {
            totalConsultations: 1,
          },
        }
      );

      return res.status(200).json({
        success: true,
        message:
          'Consultation completed successfully',
        consultation,
      });
    } catch (error) {
      console.error(
        'Complete consultation error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to complete consultation',
        error: error.message,
      });
    }
  };