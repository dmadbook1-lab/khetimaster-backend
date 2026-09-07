import mongoose from 'mongoose';
import MachineryBooking from '../models/MachineryBooking.js';
import Machinery from '../models/Machinery.js';



/*
|--------------------------------------------------------------------------
| SAFE AUTH USER ID HELPER
|--------------------------------------------------------------------------
*/

const getAuthenticatedUserId = req => {
  if (!req.user) return null;
  return (
    req.user._id ||
    req.user.id ||
    req.user.userId ||
    (req.user._doc && (req.user._doc._id || req.user._doc.id)) ||
    null
  );
};

/*
|--------------------------------------------------------------------------
| POPULATE BOOKING
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| POPULATE BOOKING (Deep Nested Population Fix)
|--------------------------------------------------------------------------
*/

const populateBooking = query => {
  return query
    .populate(
      'farmer',
      'fullName email phoneNumber profileImage village district state',
    )
    .populate({
      path: 'machinery',
      select: 'name category brand model modelYear images enginePower fuelType driveType supportsImplements supportedImplements pricing availability state district village address owner rating totalReviews totalJobsCompleted ownerName',
      populate: {
        path: 'owner',
        select: 'fullName email phoneNumber profileImage village district state',
      },
    });
};

/*
|--------------------------------------------------------------------------
| CREATE MACHINERY BOOKING
|--------------------------------------------------------------------------
*/

export const createMachineryBooking = async (req, res) => {
  try {
    const rawFarmerId = getAuthenticatedUserId(req);

    if (!rawFarmerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in to book machinery.',
      });
    }

    const farmerId = mongoose.Types.ObjectId.isValid(rawFarmerId)
      ? new mongoose.Types.ObjectId(rawFarmerId)
      : rawFarmerId;

    const {
      machinery,
      bookingDate,
      startTime,
      endTime,
      workType,
      service,
      selectedImplement,
      pricingType,
      duration,
      durationUnit,
      basePrice,
      platformFee,
      taxes,
      totalAmount,
      state,
      district,
      village,
      address,
      farmName,
      farmLocation,
      farmSize,
      crop,
      paymentMethod,
      farmerNotes,
    } = req.body;

    /*
    |--------------------------------------------------------------------------
    | VALIDATION
    |--------------------------------------------------------------------------
    */

    if (!machinery) {
      return res.status(400).json({
        success: false,
        message: 'Machinery is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(machinery)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid machinery ID',
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

    /*
    |--------------------------------------------------------------------------
    | FIND MACHINERY
    |--------------------------------------------------------------------------
    */

    const machineryDoc = await Machinery.findOne({
      _id: machinery,
      isActive: true,
    });

    if (!machineryDoc) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found or unavailable',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | OWNER CANNOT BOOK OWN MACHINERY
    |--------------------------------------------------------------------------
    */

    if (
      machineryDoc.owner &&
      farmerId &&
      machineryDoc.owner.toString() === farmerId.toString()
    ) {
      return res.status(400).json({
        success: false,
        message: 'You cannot book your own machinery',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | AVAILABILITY
    |--------------------------------------------------------------------------
    */

    if (machineryDoc.availability !== 'available') {
      return res.status(400).json({
        success: false,
        message: 'This machinery is currently unavailable',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | IMPLEMENT VALIDATION
    |--------------------------------------------------------------------------
    */

    if (selectedImplement) {
      if (!machineryDoc.supportsImplements) {
        return res.status(400).json({
          success: false,
          message: 'This machinery does not support implements',
        });
      }

      const supported = (machineryDoc.supportedImplements || []).map(item =>
        String(item).toLowerCase().trim(),
      );

      if (!supported.includes(String(selectedImplement).toLowerCase().trim())) {
        return res.status(400).json({
          success: false,
          message: 'Selected implement is not supported by this machinery',
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | PRICING
    |--------------------------------------------------------------------------
    */

    const selectedPricingType = pricingType || 'daily';
    let calculatedBasePrice = Number(basePrice || 0);

    if (selectedPricingType === 'hourly') {
      const hours = Number(duration || 0);
      if (hours <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Duration in hours is required and must be greater than 0',
        });
      }
      calculatedBasePrice = Number(machineryDoc.pricing?.hourly || 0) * hours;
    }

    if (selectedPricingType === 'daily') {
      const days = Number(duration || 1);
      if (days <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Duration in days must be greater than 0',
        });
      }
      calculatedBasePrice = Number(machineryDoc.pricing?.daily || 0) * days;
    }

    if (selectedPricingType === 'custom') {
      calculatedBasePrice = Number(basePrice || 0);
      if (calculatedBasePrice <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Custom price is required',
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | FEES
    |--------------------------------------------------------------------------
    */

    const finalPlatformFee = Number(platformFee || 0);
    const finalTaxes = Number(taxes || 0);
    const calculatedTotal = Number(calculatedBasePrice + finalPlatformFee + finalTaxes);

    const finalTotal =
      totalAmount !== undefined ? Number(totalAmount) : calculatedTotal;

    /*
    |--------------------------------------------------------------------------
    | CREATE BOOKING
    |--------------------------------------------------------------------------
    */

    const booking = await MachineryBooking.create({
      farmer: farmerId,
      machinery,
      bookingDate: new Date(bookingDate),
      startTime: String(startTime).trim(),
      endTime: endTime || '',
      workType: String(workType).trim(),
      service: service || '',
      selectedImplement: selectedImplement || '',
      pricingType: selectedPricingType,
      duration: Number(duration || 0),
      durationUnit:
        durationUnit ||
        (selectedPricingType === 'hourly'
          ? 'hours'
          : selectedPricingType === 'daily'
          ? 'days'
          : 'custom'),
      basePrice: calculatedBasePrice,
      platformFee: finalPlatformFee,
      taxes: finalTaxes,
      totalAmount: finalTotal,
      state: state || machineryDoc.state || '',
      district: district || machineryDoc.district || '',
      village: village || machineryDoc.village || '',
      address: address || machineryDoc.address || '',
      farmName: farmName || '',
      farmLocation: farmLocation || '',
      farmSize: farmSize || '',
      crop: crop || '',
      paymentMethod: paymentMethod || 'cod',
      farmerNotes: farmerNotes || '',
      status: 'pending',
    });

    const populatedBooking = await populateBooking(
      MachineryBooking.findById(booking._id),
    );

    return res.status(201).json({
      success: true,
      message: 'Machinery rental request sent successfully',
      booking: populatedBooking,
    });
  } catch (error) {
    console.error('CREATE MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create machinery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| FARMER - MY MACHINERY BOOKINGS
|--------------------------------------------------------------------------
*/

export const getMyMachineryBookings = async (req, res) => {
  try {
    const rawFarmerId = getAuthenticatedUserId(req);

    if (!rawFarmerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to view your bookings',
      });
    }

    const status = req.query.status;
    const filter = { farmer: rawFarmerId };

    if (status && status !== 'all') {
      filter.status = status;
    }

    const bookings = await populateBooking(
      MachineryBooking.find(filter).sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error('GET MY MACHINERY BOOKINGS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery bookings',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| MACHINERY OWNER - REQUESTS
|--------------------------------------------------------------------------
*/

export const getMachineryRequests = async (req, res) => {
  try {
    const rawOwnerId = getAuthenticatedUserId(req);

    if (!rawOwnerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to view requests',
      });
    }

    const status = req.query.status;

    const machinery = await Machinery.find({ owner: rawOwnerId }).select('_id');
    const machineryIds = machinery.map(item => item._id);

    if (machineryIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        requests: [],
      });
    }

    const filter = {
      machinery: { $in: machineryIds },
    };

    if (!status || status === 'all') {
      filter.status = { $in: ['pending', 'confirmed'] };
    } else {
      filter.status = status;
    }

    const requests = await populateBooking(
      MachineryBooking.find(filter).sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error('GET MACHINERY REQUESTS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery requests',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET BOOKING BY ID
|--------------------------------------------------------------------------
*/

export const getMachineryBookingById = async (req, res) => {
  try {
    const rawUserId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!rawUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
      });
    }

    const booking = await populateBooking(MachineryBooking.findById(id));

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    const isFarmer =
      booking.farmer &&
      booking.farmer._id.toString() === rawUserId.toString();

    const machineryOwner = booking.machinery?.owner;

    const isOwner =
      machineryOwner &&
      machineryOwner.toString() === rawUserId.toString();

    if (!isFarmer && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to view this booking',
      });
    }

    return res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    console.error('GET MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACCEPT BOOKING
|--------------------------------------------------------------------------
*/

export const acceptMachineryBooking = async (req, res) => {
  try {
    const rawOwnerId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!rawOwnerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const booking = await MachineryBooking.findById(id).populate('machinery');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (
      !booking.machinery?.owner ||
      booking.machinery.owner.toString() !== rawOwnerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to accept this booking',
      });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This booking is already ${booking.status}`,
      });
    }

    booking.status = 'confirmed';
    await booking.save();

    const populatedBooking = await populateBooking(
      MachineryBooking.findById(booking._id),
    );

    return res.status(200).json({
      success: true,
      message: 'Machinery booking accepted and confirmed',
      booking: populatedBooking,
    });
  } catch (error) {
    console.error('ACCEPT MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept machinery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| REJECT BOOKING
|--------------------------------------------------------------------------
*/

export const rejectMachineryBooking = async (req, res) => {
  try {
    const rawOwnerId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!rawOwnerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const booking = await MachineryBooking.findById(id).populate('machinery');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (
      !booking.machinery?.owner ||
      booking.machinery.owner.toString() !== rawOwnerId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to reject this booking',
      });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot reject a ${booking.status} booking`,
      });
    }

    booking.status = 'rejected';
    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Machinery booking request rejected',
      booking,
    });
  } catch (error) {
    console.error('REJECT MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject machinery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| CANCEL BOOKING
|--------------------------------------------------------------------------
*/

export const cancelMachineryBooking = async (req, res) => {
  try {
    const rawUserId = getAuthenticatedUserId(req);
    const { id } = req.params;
    const { reason = '' } = req.body;

    if (!rawUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const booking = await MachineryBooking.findById(id).populate('machinery');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    const isFarmer =
      booking.farmer &&
      booking.farmer.toString() === rawUserId.toString();

    const isOwner =
      booking.machinery?.owner &&
      booking.machinery.owner.toString() === rawUserId.toString();

    if (!isFarmer && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to cancel this booking',
      });
    }

    if (['cancelled', 'completed', 'rejected'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a ${booking.status} booking`,
      });
    }

    booking.status = 'cancelled';
    booking.cancellationReason = reason;
    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Machinery booking cancelled successfully',
      booking,
    });
  } catch (error) {
    console.error('CANCEL MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel machinery booking',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| COMPLETE BOOKING
|--------------------------------------------------------------------------
*/

export const completeMachineryBooking = async (req, res) => {
  try {
    const rawUserId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!rawUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const booking = await MachineryBooking.findById(id).populate('machinery');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    const isFarmer =
      booking.farmer &&
      booking.farmer.toString() === rawUserId.toString();

    const isOwner =
      booking.machinery?.owner &&
      booking.machinery.owner.toString() === rawUserId.toString();

    if (!isFarmer && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to complete this booking',
      });
    }

    if (booking.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Only confirmed bookings can be completed',
      });
    }

    booking.status = 'completed';
    await booking.save();

    await Machinery.findByIdAndUpdate(booking.machinery._id, {
      $inc: { totalJobsCompleted: 1 },
    });

    return res.status(200).json({
      success: true,
      message: 'Machinery booking completed successfully',
      booking,
    });
  } catch (error) {
    console.error('COMPLETE MACHINERY BOOKING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete machinery booking',
      error: error.message,
    });
  }
};