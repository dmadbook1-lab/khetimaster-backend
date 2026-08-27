import mongoose from 'mongoose';

import LabourBooking from '../models/LabourBooking.js';
import Labourer from '../models/Labourer.js';

const isValidObjectId = (id) => {
  return id && mongoose.Types.ObjectId.isValid(id);
};

const getAuthenticatedUserId = (req) => {
  return req.user?.userId;
};

export const createLabourBooking = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);

    if (!farmerId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    if (!isValidObjectId(farmerId)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authenticated user ID',
      });
    }

    const {
      labourerId,
      bookingDate,
      startTime,
      endTime,
      workType,
      description,
      state,
      district,
      village,
      address,
      wage,
      totalAmount,
      wageType,
      farmerNotes,
    } = req.body;

    if (!labourerId) {
      return res.status(400).json({
        success: false,
        message: 'Labourer ID is required',
      });
    }

    if (!isValidObjectId(labourerId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid labourer ID',
      });
    }

    if (!bookingDate) {
      return res.status(400).json({
        success: false,
        message: 'Booking date is required',
      });
    }

    if (!startTime) {
      return res.status(400).json({
        success: false,
        message: 'Start time is required',
      });
    }

    if (!workType) {
      return res.status(400).json({
        success: false,
        message: 'Work type is required',
      });
    }

    const labourer = await Labourer.findOne({ _id: labourerId, isActive: true });

    if (!labourer) {
      return res.status(404).json({
        success: false,
        message: 'Labourer not found or unavailable',
      });
    }

    if (labourer.user && String(labourer.user) === String(farmerId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot book your own labour profile',
      });
    }

    if (labourer.availability !== 'available') {
      return res.status(409).json({
        success: false,
        message: 'This labourer is currently unavailable',
      });
    }

    const existingBooking = await LabourBooking.findOne({
      farmer: farmerId,
      labourer: labourerId,
      bookingDate: new Date(bookingDate),
      status: { $in: ['pending', 'confirmed', 'accepted'] },
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: 'You already have a booking with this labourer for this date',
        booking: existingBooking,
      });
    }

    const finalWage =
      wage !== undefined && wage !== null && wage !== ''
        ? Number(wage)
        : Number(labourer.expectedWage || 0);

    const finalTotal =
      totalAmount !== undefined && totalAmount !== null && totalAmount !== ''
        ? Number(totalAmount)
        : finalWage;

    const booking = await LabourBooking.create({
      farmer: farmerId,
      labourer: labourerId,
      bookingDate: new Date(bookingDate),
      startTime: String(startTime),
      endTime: endTime ? String(endTime) : '',
      workType: String(workType).trim(),
      description: description || '',
      state: state || labourer.state || '',
      district: district || labourer.district || '',
      village: village || labourer.village || '',
      address: address || '',
      wage: finalWage,
      totalAmount: finalTotal,
      wageType: wageType || labourer.wageType || 'daily',
      farmerNotes: farmerNotes || '',
      status: 'pending',
    });

    const populatedBooking = await LabourBooking.findById(booking._id)
      .populate(
        'labourer',
        'fullName profileImage labourType skills experience experienceUnit expectedWage wageType village district state rating totalReviews'
      )
      .populate('farmer', 'fullName email phoneNumber');

    return res.status(201).json({
      success: true,
      message: 'Labour booking created successfully',
      booking: populatedBooking,
    });
  } catch (error) {
    console.error('Create labour booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create labour booking',
      error: error.message,
    });
  }
};

export const getMyBookings = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);

    if (!farmerId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    if (!isValidObjectId(farmerId)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authenticated user ID',
      });
    }

    const { status, page = 1, limit = 20 } = req.query;

    const filters = { farmer: farmerId };

    if (status) {
      filters.status = status;
    }

    const currentPage = Math.max(Number(page) || 1, 1);

    const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const skip = (currentPage - 1) * perPage;

    const [bookings, total] = await Promise.all([
      LabourBooking.find(filters)
        .populate(
          'labourer',
          'fullName profileImage labourType skills experience experienceUnit expectedWage wageType village district state gender age rating totalReviews totalJobsCompleted'
        )
        .sort({ bookingDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),

      LabourBooking.countDocuments(filters),
    ]);

    const totalPages = Math.ceil(total / perPage);

    return res.status(200).json({
      success: true,
      message: 'Bookings fetched successfully',
      count: bookings.length,
      total,
      pagination: {
        currentPage,
        limit: perPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
      bookings,
    });
  } catch (error) {
    console.error('Get my bookings error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message,
    });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);

    if (!farmerId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
      });
    }

    const booking = await LabourBooking.findOne({ _id: id, farmer: farmerId })
      .populate(
        'labourer',
        'fullName profileImage labourType skills experience experienceUnit expectedWage wageType village district state gender age rating totalReviews totalJobsCompleted languages preferredWork'
      )
      .populate('farmer', 'fullName email phoneNumber')
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    return res.status(200).json({ success: true, booking });
  } catch (error) {
    console.error('Get booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message,
    });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const farmerId = getAuthenticatedUserId(req);

    if (!farmerId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
      });
    }

    const { reason = '' } = req.body || {};

    const booking = await LabourBooking.findOne({ _id: id, farmer: farmerId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (['cancelled', 'completed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Booking cannot be cancelled because it is already ${booking.status}`,
      });
    }

    booking.status = 'cancelled';

    booking.cancellationReason = reason;

    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      booking,
    });
  } catch (error) {
    console.error('Cancel booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message,
    });
  }
};

export const acceptBooking = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
      });
    }

    const booking = await LabourBooking.findById(id).populate('labourer');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (!booking.labourer || String(booking.labourer.user) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to accept this booking',
      });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`,
      });
    }

    booking.status = 'accepted';

    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Booking accepted successfully',
      booking,
    });
  } catch (error) {
    console.error('Accept booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to accept booking',
      error: error.message,
    });
  }
};

export const rejectBooking = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
      });
    }

    const booking = await LabourBooking.findById(id).populate('labourer');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (!booking.labourer || String(booking.labourer.user) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reject this booking',
      });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`,
      });
    }

    booking.status = 'rejected';

    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Booking rejected successfully',
      booking,
    });
  } catch (error) {
    console.error('Reject booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to reject booking',
      error: error.message,
    });
  }
};

export const completeBooking = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
      });
    }

    const booking = await LabourBooking.findById(id).populate('labourer');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    const isFarmer = String(booking.farmer) === String(userId);

    const isLabourer = booking.labourer && String(booking.labourer.user) === String(userId);

    if (!isFarmer && !isLabourer) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to complete this booking',
      });
    }

    if (!['accepted', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only accepted or confirmed bookings can be completed',
      });
    }

    booking.status = 'completed';

    await booking.save();

    if (booking.labourer?._id) {
      await Labourer.findByIdAndUpdate(booking.labourer._id, {
        $inc: { totalJobsCompleted: 1 },
        $set: { availability: 'available' },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Booking completed successfully',
      booking,
    });
  } catch (error) {
    console.error('Complete booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to complete booking',
      error: error.message,
    });
  }
};

export const getLabourerRequests = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const labourer = await Labourer.findOne({ user: userId }).select('_id');

    if (!labourer) {
      return res.status(404).json({
        success: false,
        message: 'Labourer profile not found',
      });
    }

    const bookings = await LabourBooking.find({ labourer: labourer._id })
      .populate('farmer', 'fullName email phoneNumber state district village')
      .populate('labourer', 'fullName profileImage labourType expectedWage')
      .sort({ bookingDate: -1, createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    console.error('Get labourer requests error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch labour requests',
      error: error.message,
    });
  }
};
