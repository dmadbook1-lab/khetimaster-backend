import mongoose from 'mongoose';
import Labourer from '../models/Labourer.js';

const isValidObjectId = (id) => {
  return id && mongoose.Types.ObjectId.isValid(id);
};

const getAuthenticatedUserId = (req) => {
  return req.user?.userId;
};

export const createLabourer = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authenticated user ID',
      });
    }

    const existingLabourer = await Labourer.findOne({ user: userId });

    if (existingLabourer) {
      return res.status(409).json({
        success: false,
        message: 'Labourer profile already exists',
        labourer: existingLabourer,
      });
    }

    const {
      fullName,
      phoneNumber,
      profileImage,
      gender,
      age,
      labourType,
      skills,
      experience,
      experienceUnit,
      expectedWage,
      wageType,
      availability,
      availableFrom,
      availableUntil,
      state,
      district,
      village,
      languages,
      preferredWork,
    } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Full name is required',
      });
    }

    if (!labourType || !labourType.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Labour type is required',
      });
    }

    const labourer = await Labourer.create({
      user: userId,
      fullName: fullName.trim(),
      phoneNumber: phoneNumber || '',
      profileImage: profileImage || '',
      gender: gender || 'other',
      age: age !== undefined && age !== null && age !== '' ? Number(age) : null,
      labourType: labourType.trim(),
      skills: Array.isArray(skills) ? skills : [],
      experience:
        experience !== undefined && experience !== null && experience !== ''
          ? Number(experience)
          : 0,
      experienceUnit: experienceUnit || 'years',
      expectedWage:
        expectedWage !== undefined && expectedWage !== null && expectedWage !== ''
          ? Number(expectedWage)
          : 0,
      wageType: wageType || 'daily',
      availability: availability || 'available',
      availableFrom: availableFrom || null,
      availableUntil: availableUntil || null,
      state: state || '',
      district: district || '',
      village: village || '',
      languages: Array.isArray(languages) ? languages : [],
      preferredWork: Array.isArray(preferredWork) ? preferredWork : [],
      profileCompleted: true,
      isActive: true,
    });

    return res
      .status(201)
      .json({ success: true, message: 'Labourer profile created successfully', labourer });
  } catch (error) {
    console.error('Create labourer error:', error);

    if (error.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: 'Labourer profile already exists for this user' });
    }

    return res
      .status(500)
      .json({ success: false, message: 'Failed to create labourer profile', error: error.message });
  }
};

export const getAllLabourers = async (req, res) => {
  try {
    const currentUserId = getAuthenticatedUserId(req);

    const {
      search,
      labourType,
      skill,
      state,
      district,
      village,
      availability,
      minWage,
      maxWage,
      minExperience,
      maxExperience,
      gender,
      page = 1,
      limit = 20,
    } = req.query;

    const filters = { isActive: true };

    if (currentUserId && isValidObjectId(currentUserId)) {
      filters.user = { $ne: new mongoose.Types.ObjectId(currentUserId) };
    }

    if (availability) {
      filters.availability = availability;
    } else {
      filters.availability = 'available';
    }

    if (search && search.trim()) {
      filters.$or = [
        { fullName: { $regex: search.trim(), $options: 'i' } },
        { labourType: { $regex: search.trim(), $options: 'i' } },
        { skills: { $regex: search.trim(), $options: 'i' } },
        { preferredWork: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    if (labourType && labourType.trim()) {
      filters.labourType = { $regex: `^${labourType.trim()}$`, $options: 'i' };
    }

    if (skill && skill.trim()) {
      filters.skills = { $regex: skill.trim(), $options: 'i' };
    }

    if (state && state.trim()) {
      filters.state = { $regex: `^${state.trim()}$`, $options: 'i' };
    }

    if (district && district.trim()) {
      filters.district = { $regex: `^${district.trim()}$`, $options: 'i' };
    }

    if (village && village.trim()) {
      filters.village = { $regex: `^${village.trim()}$`, $options: 'i' };
    }

    if (gender) {
      filters.gender = gender;
    }

    if (minWage || maxWage) {
      filters.expectedWage = {};

      if (minWage) filters.expectedWage.$gte = Number(minWage);
      if (maxWage) filters.expectedWage.$lte = Number(maxWage);
    }

    if (minExperience || maxExperience) {
      filters.experience = {};

      if (minExperience) filters.experience.$gte = Number(minExperience);
      if (maxExperience) filters.experience.$lte = Number(maxExperience);
    }

    const currentPage = Math.max(Number(page) || 1, 1);

    const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const skip = (currentPage - 1) * perPage;

    const [labourers, total] = await Promise.all([
      Labourer.find(filters)
        .sort({ rating: -1, totalJobsCompleted: -1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),

      Labourer.countDocuments(filters),
    ]);

    const totalPages = Math.ceil(total / perPage);

    return res.status(200).json({
      success: true,
      message: 'Labourers fetched successfully',
      count: labourers.length,
      total,
      pagination: {
        currentPage,
        limit: perPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
      labourers,
    });
  } catch (error) {
    console.error('Get all labourers error:', error);

    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch labourers', error: error.message });
  }
};

export const getMyLabourerProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authenticated user not found' });
    }

    const labourer = await Labourer.findOne({ user: userId });

    if (!labourer) {
      return res.status(404).json({ success: false, message: 'Labourer profile not found' });
    }

    return res.status(200).json({ success: true, labourer });
  } catch (error) {
    console.error('Get my labourer profile error:', error);

    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch labourer profile', error: error.message });
  }
};

export const getLabourerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid labourer ID' });
    }

    const labourer = await Labourer.findOne({ _id: id, isActive: true }).lean();

    if (!labourer) {
      return res.status(404).json({ success: false, message: 'Labourer not found' });
    }

    return res.status(200).json({ success: true, labourer });
  } catch (error) {
    console.error('Get labourer by ID error:', error);

    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch labourer', error: error.message });
  }
};

export const updateMyLabourerProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId)
      return res.status(401).json({ success: false, message: 'Authenticated user not found' });

    const allowedFields = [
      'fullName',
      'phoneNumber',
      'profileImage',
      'gender',
      'age',
      'labourType',
      'skills',
      'experience',
      'experienceUnit',
      'expectedWage',
      'wageType',
      'availability',
      'availableFrom',
      'availableUntil',
      'state',
      'district',
      'village',
      'languages',
      'preferredWork',
      'profileCompleted',
    ];

    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }

    if (updateData.fullName !== undefined && typeof updateData.fullName === 'string')
      updateData.fullName = updateData.fullName.trim();
    if (updateData.labourType !== undefined && typeof updateData.labourType === 'string')
      updateData.labourType = updateData.labourType.trim();
    if (updateData.experience !== undefined) updateData.experience = Number(updateData.experience);
    if (updateData.expectedWage !== undefined)
      updateData.expectedWage = Number(updateData.expectedWage);
    if (updateData.age !== undefined) updateData.age = Number(updateData.age);

    const labourer = await Labourer.findOneAndUpdate(
      { user: userId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!labourer)
      return res.status(404).json({ success: false, message: 'Labourer profile not found' });

    return res
      .status(200)
      .json({ success: true, message: 'Labourer profile updated successfully', labourer });
  } catch (error) {
    console.error('Update labourer profile error:', error);

    return res
      .status(500)
      .json({ success: false, message: 'Failed to update labourer profile', error: error.message });
  }
};

export const deactivateMyLabourerProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId)
      return res.status(401).json({ success: false, message: 'Authenticated user not found' });

    const labourer = await Labourer.findOneAndUpdate(
      { user: userId },
      { $set: { isActive: false, availability: 'unavailable' } },
      { new: true }
    );

    if (!labourer)
      return res.status(404).json({ success: false, message: 'Labourer profile not found' });

    return res
      .status(200)
      .json({ success: true, message: 'Labourer profile deactivated successfully', labourer });
  } catch (error) {
    console.error('Deactivate labourer error:', error);

    return res
      .status(500)
      .json({
        success: false,
        message: 'Failed to deactivate labourer profile',
        error: error.message,
      });
  }
};

export const activateMyLabourerProfile = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId)
      return res.status(401).json({ success: false, message: 'Authenticated user not found' });

    const labourer = await Labourer.findOneAndUpdate(
      { user: userId },
      { $set: { isActive: true, availability: 'available' } },
      { new: true }
    );

    if (!labourer)
      return res.status(404).json({ success: false, message: 'Labourer profile not found' });

    return res
      .status(200)
      .json({ success: true, message: 'Labourer profile activated successfully', labourer });
  } catch (error) {
    console.error('Activate labourer error:', error);

    return res
      .status(500)
      .json({
        success: false,
        message: 'Failed to activate labourer profile',
        error: error.message,
      });
  }
};
