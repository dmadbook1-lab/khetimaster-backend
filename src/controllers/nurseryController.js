import mongoose from 'mongoose';

import Plant from '../models/Plant.js';
import NurseryOrder from '../models/NurseryOrder.js';
import User from '../models/User.js';

import {
  PLANT_CATEGORIES,
  ORDER_FLOW,
  FREE_DELIVERY_THRESHOLD,
  DELIVERY_FEE,
  MAX_IMAGES,
} from '../data/nurseryOptions.js';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getAuthenticatedUserId = (req) => {
  const userId = req.user?.userId;
  return userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null;
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactInsensitive = (value) => new RegExp(`^${escapeRegex(value.trim())}$`, 'i');

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

/*
 * Validates plant fields from the request body.
 *
 * On create the required fields must be present. On update only the
 * fields that were sent are validated and returned.
 *
 * Returns { fields } or { error }.
 */
const buildPlantFields = (body, { isCreate }) => {
  const fields = {};
  const has = (key) => body[key] !== undefined;

  for (const [key, label] of [
    ['name', 'Plant name'],
    ['category', 'Plant category'],
  ]) {
    if (isCreate || has(key)) {
      const value = trimString(body[key]);

      if (!value) return { error: `${label} is required` };
      if (value.length > 100) return { error: `${label} must be at most 100 characters` };

      fields[key] = value;
    }
  }

  if (has('description')) {
    const description = trimString(body.description);

    if (description.length > 1000) {
      return { error: 'Description must be at most 1000 characters' };
    }

    fields.description = description;
  }

  if (has('images')) {
    if (!Array.isArray(body.images) || body.images.some((image) => typeof image !== 'string')) {
      return { error: 'Images must be a list of URLs' };
    }

    if (body.images.length > MAX_IMAGES) {
      return { error: `At most ${MAX_IMAGES} images are allowed` };
    }

    fields.images = body.images.map((image) => image.trim()).filter(Boolean);
  }

  if (isCreate || has('price')) {
    const price = parseNumber(body.price);

    if (price === null || !Number.isFinite(price) || price <= 0) {
      return { error: 'A valid plant price is required' };
    }

    fields.price = Math.round(price * 100) / 100;
  }

  if (isCreate || has('quantity')) {
    const quantity = parseNumber(body.quantity);

    if (quantity === null || !Number.isInteger(quantity) || quantity < 0) {
      return { error: 'Quantity must be a valid whole number' };
    }

    if (isCreate && quantity === 0) {
      return { error: 'Quantity must be at least 1' };
    }

    fields.quantity = quantity;
  }

  for (const key of ['state', 'district']) {
    if (has(key)) fields[`location.${key}`] = trimString(body[key]);
  }

  if (has('isActive')) fields.isActive = Boolean(body.isActive);

  return { fields };
};

/*
 * Recent buyer reviews of a plant.
 */
const getPlantReviews = (plantId, limit = 10) =>
  NurseryOrder.aggregate([
    { $match: { 'items.plant': new mongoose.Types.ObjectId(String(plantId)) } },
    { $unwind: '$items' },
    {
      $match: {
        'items.plant': new mongoose.Types.ObjectId(String(plantId)),
        'items.review.rating': { $ne: null },
      },
    },
    { $sort: { 'items.review.createdAt': -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        rating: '$items.review.rating',
        comment: '$items.review.comment',
        createdAt: '$items.review.createdAt',
        buyerName: '$deliveryAddress.fullName',
      },
    },
  ]);

/*
|--------------------------------------------------------------------------
| GET NURSERY META
|--------------------------------------------------------------------------
| GET /api/nursery/meta
|
| Suggested categories, order statuses and delivery rules.
|--------------------------------------------------------------------------
*/

export const getNurseryMeta = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      categories: PLANT_CATEGORIES,
      orderStatuses: [...ORDER_FLOW, 'CANCELLED'],
      delivery: {
        fee: DELIVERY_FEE,
        freeAbove: FREE_DELIVERY_THRESHOLD,
      },
      paymentMethods: ['COD'],
    },
  });
};

/*
|--------------------------------------------------------------------------
| GET ALL PLANTS
|--------------------------------------------------------------------------
| GET /api/nursery/plants
|
| Optional query parameters:
|
| ?category=Fruit Plants
| ?search=mango             (matches part of name, description, category)
| ?state=Maharashtra
| ?district=Pune
| ?minPrice=20&maxPrice=500
| ?seller=<userId>
| ?sort=newest (default) | price_asc | price_desc | rating | popular
| ?page=1&limit=20
|
*/

export const getPlants = async (req, res) => {
  try {
    const { category, search, state, district, minPrice, maxPrice, seller, sort } = req.query;

    const filter = {
      isActive: true,
      quantity: { $gt: 0 },
    };

    if (category && String(category).trim()) {
      filter.category = exactInsensitive(String(category));
    }

    if (state && String(state).trim()) filter['location.state'] = exactInsensitive(String(state));

    if (district && String(district).trim()) {
      filter['location.district'] = exactInsensitive(String(district));
    }

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim()), 'i');

      filter.$or = [{ name: pattern }, { description: pattern }, { category: pattern }];
    }

    const min = parseNumber(minPrice);
    const max = parseNumber(maxPrice);

    if (Number.isFinite(min) || Number.isFinite(max)) {
      filter.price = {};
      if (Number.isFinite(min)) filter.price.$gte = min;
      if (Number.isFinite(max)) filter.price.$lte = max;
    }

    if (seller) {
      if (!isValidId(seller)) {
        return res.status(400).json({ success: false, message: 'Invalid seller ID' });
      }

      filter['seller.userId'] = seller;
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      price_asc: { price: 1, createdAt: -1 },
      price_desc: { price: -1, createdAt: -1 },
      rating: { rating: -1, totalReviews: -1 },
      popular: { totalSold: -1, createdAt: -1 },
    };

    const currentPage = Math.max(Number(req.query.page) || 1, 1);
    const itemsPerPage = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    const [plants, total] = await Promise.all([
      Plant.find(filter)
        .sort(sortOptions[sort] || sortOptions.newest)
        .skip((currentPage - 1) * itemsPerPage)
        .limit(itemsPerPage)
        .lean(),

      Plant.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: plants,
      pagination: {
        page: currentPage,
        limit: itemsPerPage,
        total,
        totalPages: Math.ceil(total / itemsPerPage),
      },
    });
  } catch (error) {
    console.error('Get nursery plants error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch plants',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET SINGLE PLANT
|--------------------------------------------------------------------------
| GET /api/nursery/plants/:id
|
| Includes recent buyer reviews.
|--------------------------------------------------------------------------
*/

export const getPlantById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plant ID',
      });
    }

    const plant = await Plant.findOne({ _id: id, isActive: true }).lean();

    if (!plant) {
      return res.status(404).json({
        success: false,
        message: 'Plant not found',
      });
    }

    const reviews = await getPlantReviews(id);

    return res.status(200).json({
      success: true,
      data: {
        ...plant,
        inStock: plant.quantity > 0,
        recentReviews: reviews,
      },
    });
  } catch (error) {
    console.error('Get nursery plant error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch plant',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET CATEGORIES
|--------------------------------------------------------------------------
| GET /api/nursery/categories
|
| Categories that currently have plants (case-insensitive, de-duplicated).
|--------------------------------------------------------------------------
*/

export const getCategories = async (req, res) => {
  try {
    const categories = await Plant.distinct('category', {
      isActive: true,
      quantity: { $gt: 0 },
    });

    const unique = new Map();

    for (const category of categories) {
      const trimmed = typeof category === 'string' ? category.trim() : '';
      if (trimmed && !unique.has(trimmed.toLowerCase())) unique.set(trimmed.toLowerCase(), trimmed);
    }

    return res.status(200).json({
      success: true,
      data: [...unique.values()].sort((a, b) => a.localeCompare(b)),
    });
  } catch (error) {
    console.error('Get nursery categories error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
    });
  }
};

/*
|--------------------------------------------------------------------------
| CREATE PLANT LISTING
|--------------------------------------------------------------------------
| POST /api/nursery/plants
|
| State and district default to the seller's profile.
|--------------------------------------------------------------------------
*/

export const createPlant = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const user = await User.findById(userId).select('fullName email state district');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    const body = { ...req.body };

    for (const key of ['state', 'district']) {
      if (body[key] === undefined || body[key] === '') body[key] = user[key] || '';
    }

    const { fields, error } = buildPlantFields(body, { isCreate: true });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const location = {
      state: fields['location.state'],
      district: fields['location.district'],
    };

    delete fields['location.state'];
    delete fields['location.district'];

    const plant = await Plant.create({
      ...fields,
      location,
      seller: {
        userId: user._id,
        name: user.fullName || user.email || 'KhetiMaster User',
      },
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Plant listed successfully',
      data: plant,
    });
  } catch (error) {
    console.error('Create plant listing error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to list plant',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY LISTINGS
|--------------------------------------------------------------------------
| GET /api/nursery/my-listings
|
| Each listing includes pendingOrders: units ordered that the seller
| still has to confirm or dispatch.
|--------------------------------------------------------------------------
*/

export const getMyListings = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const plants = await Plant.find({ 'seller.userId': userId }).sort({ createdAt: -1 }).lean();

    const pending = await NurseryOrder.aggregate([
      { $match: { 'items.seller.userId': new mongoose.Types.ObjectId(String(userId)) } },
      { $unwind: '$items' },
      {
        $match: {
          'items.seller.userId': new mongoose.Types.ObjectId(String(userId)),
        },
      },
      {
        $addFields: {
          effectiveStatus: { $ifNull: ['$items.status', '$orderStatus'] },
        },
      },
      { $match: { effectiveStatus: { $in: ['PENDING', 'CONFIRMED'] } } },
      { $group: { _id: '$items.plant', units: { $sum: '$items.quantity' } } },
    ]);

    const pendingByPlant = new Map(pending.map((entry) => [String(entry._id), entry.units]));

    return res.status(200).json({
      success: true,
      data: plants.map((plant) => ({
        ...plant,
        pendingOrders: pendingByPlant.get(String(plant._id)) || 0,
      })),
    });
  } catch (error) {
    console.error('Get my nursery listings error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your listings',
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE PLANT LISTING
|--------------------------------------------------------------------------
| PUT /api/nursery/plants/:id
|
| Price changes only apply to new orders; existing orders keep the price
| they were placed at.
|--------------------------------------------------------------------------
*/

export const updatePlant = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plant ID',
      });
    }

    const { fields, error } = buildPlantFields(req.body, { isCreate: false });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const plant = await Plant.findOneAndUpdate(
      { _id: id, 'seller.userId': userId },
      { $set: fields },
      { returnDocument: 'after', runValidators: true }
    );

    if (!plant) {
      return res.status(404).json({
        success: false,
        message: 'Plant listing not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Plant listing updated successfully',
      data: plant,
    });
  } catch (error) {
    console.error('Update plant listing error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update plant listing',
    });
  }
};

/*
|--------------------------------------------------------------------------
| DELETE PLANT LISTING
|--------------------------------------------------------------------------
| DELETE /api/nursery/plants/:id
|
| Soft delete. Orders already placed for this plant are not affected;
| the seller still fulfils or cancels them from the seller orders screen.
|--------------------------------------------------------------------------
*/

export const deletePlant = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plant ID',
      });
    }

    const plant = await Plant.findOneAndUpdate(
      { _id: id, 'seller.userId': userId },
      { $set: { isActive: false } }
    );

    if (!plant) {
      return res.status(404).json({
        success: false,
        message: 'Plant listing not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Plant listing removed successfully',
    });
  } catch (error) {
    console.error('Delete plant listing error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to remove plant listing',
    });
  }
};
