import mongoose from 'mongoose';
import Machinery from '../models/Machinery.js';

/*
|--------------------------------------------------------------------------
| SAFE AUTH OWNER ID HELPER
|--------------------------------------------------------------------------
*/

const getAuthenticatedOwnerId = req => {
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
| CREATE MACHINERY
|--------------------------------------------------------------------------
*/

export const createMachinery = async (req, res) => {
  try {
    const rawOwnerId = getAuthenticatedOwnerId(req);

    const ownerId =
      rawOwnerId && mongoose.Types.ObjectId.isValid(rawOwnerId)
        ? new mongoose.Types.ObjectId(rawOwnerId)
        : rawOwnerId || null;

    const {
      ownerName,
      name,
      category,
      brand,
      model,
      modelYear,
      description,
      images,
      enginePower,
      fuelType,
      driveType,
      supportsImplements,
      supportedImplements,
      availability,
      availableFrom,
      availableUntil,
      state,
      district,
      village,
      address,
      pricing,
      ownerNotes,
    } = req.body;

    if (!ownerName || !ownerName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Owner name is required',
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Machinery name is required',
      });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Machinery category is required',
      });
    }

    const hasImplements = Boolean(supportsImplements);
    let implementsList = [];

    if (hasImplements) {
      implementsList = Array.isArray(supportedImplements)
        ? supportedImplements
        : [];
    }

    const machinery = await Machinery.create({
      owner: ownerId,
      ownerName: ownerName.trim(),
      name: name.trim(),
      category: category.trim(),
      brand: brand?.trim() || '',
      model: model?.trim() || '',
      modelYear: modelYear ? Number(modelYear) : null,
      description: description?.trim() || '',
      images: Array.isArray(images) ? images : [],
      enginePower: {
        value: Number(enginePower?.value || 0),
        unit: enginePower?.unit || 'HP',
      },
      fuelType: fuelType || 'diesel',
      driveType: driveType || '2WD',
      supportsImplements: hasImplements,
      supportedImplements: implementsList,
      availability: availability || 'available',
      availableFrom: availableFrom || null,
      availableUntil: availableUntil || null,
      state: state?.trim() || '',
      district: district?.trim() || '',
      village: village?.trim() || '',
      address: address?.trim() || '',
      pricing: {
        hourly: Number(pricing?.hourly || 0),
        daily: Number(pricing?.daily || 0),
        custom: Array.isArray(pricing?.custom) ? pricing.custom : [],
      },
      ownerNotes: ownerNotes?.trim() || '',
      isActive: true,
    });

    const populatedMachinery = await Machinery.findById(machinery._id).populate(
      'owner',
      'fullName email phoneNumber profileImage village district state',
    );

    return res.status(201).json({
      success: true,
      message: 'Machinery added successfully',
      machinery: populatedMachinery,
    });
  } catch (error) {
    console.error('CREATE MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY MACHINERY
|--------------------------------------------------------------------------
*/

export const getMyMachinery = async (req, res) => {
  try {
    const rawOwnerId = getAuthenticatedOwnerId(req);

    if (!rawOwnerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to view your machinery',
      });
    }

    const ownerObjectId = mongoose.Types.ObjectId.isValid(rawOwnerId)
      ? new mongoose.Types.ObjectId(rawOwnerId)
      : null;

    // Search by ObjectId or String ID
    const queryConditions = [{ owner: rawOwnerId }];
    if (ownerObjectId) {
      queryConditions.push({ owner: ownerObjectId });
    }

    const machinery = await Machinery.find({
      $or: queryConditions,
    })
      .populate(
        'owner',
        'fullName email phoneNumber profileImage village district state',
      )
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      count: machinery.length,
      machinery,
    });
  } catch (error) {
    console.error('GET MY MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET ALL MACHINERY
|--------------------------------------------------------------------------
*/

export const getAllMachinery = async (req, res) => {
  try {
    const { category, state, district, village, availability, search } =
      req.query;

    const filter = {
      isActive: true,
    };

    if (category) filter.category = category;
    if (state) filter.state = state;
    if (district) filter.district = district;
    if (village) filter.village = village;
    filter.availability = availability || 'available';

    if (search) {
      filter.$text = { $search: search };
    }

    const machinery = await Machinery.find(filter)
      .populate(
        'owner',
        'fullName email phoneNumber profileImage village district state',
      )
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      count: machinery.length,
      machinery,
    });
  } catch (error) {
    console.error('GET ALL MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MACHINERY BY ID
|--------------------------------------------------------------------------
*/

export const getMachineryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid machinery ID',
      });
    }

    const machinery = await Machinery.findOne({
      _id: id,
      isActive: true,
    }).populate(
      'owner',
      'fullName email phoneNumber profileImage village district state',
    );

    if (!machinery) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found',
      });
    }

    return res.status(200).json({
      success: true,
      machinery,
    });
  } catch (error) {
    console.error('GET MACHINERY BY ID ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE MY MACHINERY
|--------------------------------------------------------------------------
*/

export const updateMyMachinery = async (req, res) => {
  try {
    const rawOwnerId = getAuthenticatedOwnerId(req);
    const { id } = req.params;

    if (!rawOwnerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid machinery ID',
      });
    }

    const ownerObjectId = mongoose.Types.ObjectId.isValid(rawOwnerId)
      ? new mongoose.Types.ObjectId(rawOwnerId)
      : null;

    const machinery = await Machinery.findOne({
      _id: id,
      $or: [{ owner: rawOwnerId }, ...(ownerObjectId ? [{ owner: ownerObjectId }] : [])],
    });

    if (!machinery) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found or you are not the owner',
      });
    }

    const {
      ownerName,
      name,
      category,
      brand,
      model,
      modelYear,
      description,
      images,
      enginePower,
      fuelType,
      driveType,
      supportsImplements,
      supportedImplements,
      availability,
      availableFrom,
      availableUntil,
      state,
      district,
      village,
      address,
      pricing,
      ownerNotes,
    } = req.body;

    if (ownerName !== undefined) machinery.ownerName = ownerName.trim();
    if (name !== undefined) machinery.name = name.trim();
    if (category !== undefined) machinery.category = category.trim();
    if (brand !== undefined) machinery.brand = brand.trim();
    if (model !== undefined) machinery.model = model.trim();
    if (modelYear !== undefined) machinery.modelYear = modelYear ? Number(modelYear) : null;
    if (description !== undefined) machinery.description = description.trim();
    if (images !== undefined) machinery.images = Array.isArray(images) ? images : [];
    if (enginePower) {
      machinery.enginePower = {
        value: Number(enginePower.value || 0),
        unit: enginePower.unit || 'HP',
      };
    }
    if (fuelType !== undefined) machinery.fuelType = fuelType;
    if (driveType !== undefined) machinery.driveType = driveType;
    if (supportsImplements !== undefined) {
      machinery.supportsImplements = Boolean(supportsImplements);
      if (!machinery.supportsImplements) machinery.supportedImplements = [];
    }
    if (supportedImplements !== undefined) {
      machinery.supportedImplements = Array.isArray(supportedImplements)
        ? supportedImplements
        : [];
    }
    if (availability !== undefined) machinery.availability = availability;
    if (availableFrom !== undefined) machinery.availableFrom = availableFrom;
    if (availableUntil !== undefined) machinery.availableUntil = availableUntil;
    if (state !== undefined) machinery.state = state.trim();
    if (district !== undefined) machinery.district = district.trim();
    if (village !== undefined) machinery.village = village.trim();
    if (address !== undefined) machinery.address = address.trim();
    if (pricing) {
      machinery.pricing = {
        hourly: Number(pricing.hourly || 0),
        daily: Number(pricing.daily || 0),
        custom: Array.isArray(pricing.custom) ? pricing.custom : [],
      };
    }
    if (ownerNotes !== undefined) machinery.ownerNotes = ownerNotes.trim();

    await machinery.save();

    const populatedMachinery = await Machinery.findById(machinery._id).populate(
      'owner',
      'fullName email phoneNumber profileImage village district state',
    );

    return res.status(200).json({
      success: true,
      message: 'Machinery updated successfully',
      machinery: populatedMachinery,
    });
  } catch (error) {
    console.error('UPDATE MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DEACTIVATE MACHINERY
|--------------------------------------------------------------------------
*/

export const deactivateMachinery = async (req, res) => {
  try {
    const rawOwnerId = getAuthenticatedOwnerId(req);
    const { id } = req.params;

    if (!rawOwnerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const machinery = await Machinery.findOne({
      _id: id,
      owner: rawOwnerId,
    });

    if (!machinery) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found',
      });
    }

    machinery.isActive = false;
    machinery.availability = 'unavailable';
    await machinery.save();

    return res.status(200).json({
      success: true,
      message: 'Machinery deactivated successfully',
      machinery,
    });
  } catch (error) {
    console.error('DEACTIVATE MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to deactivate machinery',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACTIVATE MACHINERY
|--------------------------------------------------------------------------
*/

export const activateMachinery = async (req, res) => {
  try {
    const rawOwnerId = getAuthenticatedOwnerId(req);
    const { id } = req.params;

    if (!rawOwnerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const machinery = await Machinery.findOne({
      _id: id,
      owner: rawOwnerId,
    });

    if (!machinery) {
      return res.status(404).json({
        success: false,
        message: 'Machinery not found',
      });
    }

    machinery.isActive = true;
    machinery.availability = 'available';
    await machinery.save();

    return res.status(200).json({
      success: true,
      message: 'Machinery activated successfully',
      machinery,
    });
  } catch (error) {
    console.error('ACTIVATE MACHINERY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to activate machinery',
      error: error.message,
    });
  }
};