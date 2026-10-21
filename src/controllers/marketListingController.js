import mongoose from 'mongoose';

import MarketListing from '../models/MarketListing.js';
import MarketDeal from '../models/MarketDeal.js';
import MarketSavedListing from '../models/MarketSavedListing.js';
import User from '../models/User.js';

import {
  MARKET_CATEGORIES,
  MARKET_UNITS,
  EQUIPMENT_CONDITIONS,
  PRODUCE_GRADES,
  DISCRETE_UNITS,
  getCategory,
} from '../data/marketCategories.js';

const SELLER_FIELDS = 'fullName village taluka district state';

const MAX_IMAGES = 10;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getUserId = (req) => req.user?.userId || null;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactInsensitive = (value) => new RegExp(`^${escapeRegex(value.trim())}$`, 'i');

/*
 * undefined / null / '' -> null, anything else -> Number (may be NaN)
 */
const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const roundQuantity = (value) => Math.round(value * 1000) / 1000;

const trimString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback);

/*
 * undefined -> undefined (not sent), '' / null -> null, else Date (may be invalid)
 */
const parseDate = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(value);
};

const isInvalidDate = (date) => date instanceof Date && Number.isNaN(date.getTime());

/*
 * Listings whose product has not expired (or that have no expiry).
 */
const notExpiredFilter = () => ({
  $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }],
});

/*
 * Validates listing fields from the request body.
 *
 * On create every required field must be present. On update only the
 * fields that were sent are validated and returned.
 *
 * Returns { fields } or { error }.
 */
const buildListingFields = (body, { isCreate, existing = null }) => {
  const fields = {};
  const has = (key) => body[key] !== undefined;

  /* CATEGORY / KIND */

  if (isCreate || has('category')) {
    const category = getCategory(body.category);

    if (!category) {
      return { error: 'A valid category is required' };
    }

    if (existing && existing.kind !== category.kind) {
      return { error: 'Category cannot be changed between produce and equipment' };
    }

    fields.category = category.key;
    fields.kind = category.kind;
  }

  const kind = fields.kind || existing?.kind;

  /* TITLE / DESCRIPTION */

  if (isCreate || has('title')) {
    const title = trimString(body.title);

    if (!title) return { error: 'Title is required' };
    if (title.length > 120) return { error: 'Title must be at most 120 characters' };

    fields.title = title;
  }

  if (has('description')) {
    fields.description = trimString(body.description);
  }

  if (has('images')) {
    if (!Array.isArray(body.images) || body.images.some((image) => typeof image !== 'string')) {
      return { error: 'Images must be an array of URLs' };
    }

    if (body.images.length > MAX_IMAGES) {
      return { error: `A listing can have at most ${MAX_IMAGES} images` };
    }

    fields.images = body.images.map((image) => image.trim()).filter(Boolean);
  }

  /* UNIT / QUANTITY / PRICE */

  if (isCreate || has('unit')) {
    const unit = body.unit || (kind === 'EQUIPMENT' ? 'piece' : null);

    if (!MARKET_UNITS.includes(unit)) {
      return { error: `Unit must be one of: ${MARKET_UNITS.join(', ')}` };
    }

    fields.unit = unit;
  }

  const unit = fields.unit || existing?.unit;

  if (isCreate || has('quantity')) {
    const quantity = parseNumber(body.quantity ?? (kind === 'EQUIPMENT' ? 1 : undefined));

    if (quantity === null || !Number.isFinite(quantity) || quantity < 0) {
      return { error: 'A valid quantity is required' };
    }

    if (isCreate && quantity === 0) {
      return { error: 'Quantity must be greater than 0' };
    }

    if (DISCRETE_UNITS.includes(unit) && !Number.isInteger(quantity)) {
      return { error: `Quantity must be a whole number when the unit is ${unit}` };
    }

    fields.quantity = roundQuantity(quantity);
  }

  if (has('minOrderQuantity')) {
    const minOrderQuantity = parseNumber(body.minOrderQuantity);

    if (minOrderQuantity !== null && (!Number.isFinite(minOrderQuantity) || minOrderQuantity < 0)) {
      return { error: 'Minimum order quantity must be a positive number' };
    }

    fields.minOrderQuantity = minOrderQuantity ? roundQuantity(minOrderQuantity) : null;
  }

  if (isCreate || has('pricePerUnit')) {
    const pricePerUnit = parseNumber(body.pricePerUnit);

    if (pricePerUnit === null || !Number.isFinite(pricePerUnit) || pricePerUnit <= 0) {
      return { error: 'A valid price per unit is required' };
    }

    fields.pricePerUnit = Math.round(pricePerUnit * 100) / 100;
  }

  if (has('isNegotiable')) fields.isNegotiable = Boolean(body.isNegotiable);

  /* PRODUCE DETAILS */

  if (kind === 'PRODUCE') {
    if (has('variety')) fields.variety = trimString(body.variety);

    if (has('grade')) {
      if (!PRODUCE_GRADES.includes(body.grade)) {
        return { error: `Grade must be one of: ${PRODUCE_GRADES.join(', ')}` };
      }

      fields.grade = body.grade;
    }

    if (has('isOrganic')) fields.isOrganic = Boolean(body.isOrganic);

    if (has('harvestDate')) {
      const harvestDate = body.harvestDate ? new Date(body.harvestDate) : null;

      if (harvestDate && Number.isNaN(harvestDate.getTime())) {
        return { error: 'Invalid harvest date' };
      }

      fields.harvestDate = harvestDate;
    }
  }

  /* BRAND (equipment and inputs) */

  if ((kind === 'EQUIPMENT' || kind === 'INPUTS') && has('brand')) {
    fields.brand = trimString(body.brand);
  }

  /* EQUIPMENT DETAILS */

  if (kind === 'EQUIPMENT') {
    if (has('model')) fields.model = trimString(body.model);

    if (has('modelYear')) {
      const modelYear = parseNumber(body.modelYear);
      const maxYear = new Date().getFullYear() + 1;

      if (
        modelYear !== null &&
        (!Number.isInteger(modelYear) || modelYear < 1900 || modelYear > maxYear)
      ) {
        return { error: 'Invalid model year' };
      }

      fields.modelYear = modelYear;
    }

    if (isCreate || has('condition')) {
      if (!EQUIPMENT_CONDITIONS.includes(body.condition)) {
        return { error: `Condition must be one of: ${EQUIPMENT_CONDITIONS.join(', ')}` };
      }

      fields.condition = body.condition;
    }

    if (has('usageHours')) {
      const usageHours = parseNumber(body.usageHours);

      if (usageHours !== null && (!Number.isFinite(usageHours) || usageHours < 0)) {
        return { error: 'Usage hours must be a positive number' };
      }

      fields.usageHours = usageHours;
    }
  }

  /* INPUT DETAILS (fertilizers, pesticides...) */

  if (kind === 'INPUTS') {
    if (has('composition')) fields.composition = trimString(body.composition);
    if (has('packSize')) fields.packSize = trimString(body.packSize);
    if (has('isSealed')) fields.isSealed = Boolean(body.isSealed);

    const manufacturingDate = parseDate(body.manufacturingDate);
    const expiryDate = parseDate(body.expiryDate);

    if (isInvalidDate(manufacturingDate)) return { error: 'Invalid manufacturing date' };
    if (isInvalidDate(expiryDate)) return { error: 'Invalid expiry date' };

    if (manufacturingDate !== undefined) fields.manufacturingDate = manufacturingDate;
    if (expiryDate !== undefined) fields.expiryDate = expiryDate;

    const finalManufacturing =
      manufacturingDate !== undefined ? manufacturingDate : existing?.manufacturingDate;
    const finalExpiry = expiryDate !== undefined ? expiryDate : existing?.expiryDate;
    const category = getCategory(fields.category || existing?.category);

    if (category?.requiresExpiry && !finalExpiry) {
      return { error: `Expiry date is required for ${category.label.toLowerCase()}` };
    }

    if (expiryDate && expiryDate <= new Date()) {
      return { error: 'Expired products cannot be listed' };
    }

    if (finalManufacturing && finalManufacturing > new Date()) {
      return { error: 'Manufacturing date cannot be in the future' };
    }

    if (finalManufacturing && finalExpiry && finalExpiry <= finalManufacturing) {
      return { error: 'Expiry date must be after the manufacturing date' };
    }
  }

  /* DELIVERY */

  if (has('deliveryAvailable')) fields.deliveryAvailable = Boolean(body.deliveryAvailable);
  if (has('deliveryNotes')) fields.deliveryNotes = trimString(body.deliveryNotes);

  /* LOCATION */

  if (body.location && typeof body.location === 'object') {
    for (const key of ['state', 'district', 'taluka', 'village', 'pincode']) {
      if (body.location[key] !== undefined) {
        fields[`location.${key}`] = trimString(body.location[key]);
      }
    }
  }

  return { fields };
};

/*
 * Average rating and completed deal count per seller.
 */
export const getSellerStats = async (sellerIds) => {
  const ids = sellerIds.map((id) => new mongoose.Types.ObjectId(String(id)));

  const stats = await MarketDeal.aggregate([
    { $match: { seller: { $in: ids }, status: 'COMPLETED' } },
    {
      $group: {
        _id: '$seller',
        completedDeals: { $sum: 1 },
        averageRating: { $avg: '$review.rating' },
        totalReviews: {
          $sum: { $cond: [{ $gt: ['$review.rating', null] }, 1, 0] },
        },
      },
    },
  ]);

  const statsBySeller = new Map();

  for (const stat of stats) {
    statsBySeller.set(String(stat._id), {
      completedDeals: stat.completedDeals,
      averageRating: stat.averageRating ? Math.round(stat.averageRating * 10) / 10 : 0,
      totalReviews: stat.totalReviews,
    });
  }

  return (seller) =>
    statsBySeller.get(String(seller)) || { completedDeals: 0, averageRating: 0, totalReviews: 0 };
};

/*
|--------------------------------------------------------------------------
| GET MARKET META
|--------------------------------------------------------------------------
|
| Categories, units, conditions and grades for the app's forms/filters.
|
*/

export const getMarketMeta = async (req, res) => {
  return res.status(200).json({
    success: true,
    categories: MARKET_CATEGORIES,
    units: MARKET_UNITS,
    equipmentConditions: EQUIPMENT_CONDITIONS,
    produceGrades: PRODUCE_GRADES,
  });
};

/*
|--------------------------------------------------------------------------
| CREATE LISTING
|--------------------------------------------------------------------------
*/

export const createListing = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { fields, error } = buildListingFields(req.body, { isCreate: true });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    /*
     * Default the listing location to the seller's profile location
     * for any field the seller didn't provide.
     */
    const user = await User.findById(userId).select('state district taluka village');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const location = {
      state: fields['location.state'] ?? user.state ?? '',
      district: fields['location.district'] ?? user.district ?? '',
      taluka: fields['location.taluka'] ?? user.taluka ?? '',
      village: fields['location.village'] ?? user.village ?? '',
      pincode: fields['location.pincode'] ?? '',
    };

    for (const key of Object.keys(fields)) {
      if (key.startsWith('location.')) delete fields[key];
    }

    const listing = await MarketListing.create({
      ...fields,
      location,
      seller: userId,
      status: 'ACTIVE',
    });

    await listing.populate('seller', SELLER_FIELDS);

    return res.status(201).json({
      success: true,
      message: 'Listing created successfully',
      listing,
    });
  } catch (error) {
    console.error('CREATE MARKET LISTING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create listing',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| BROWSE LISTINGS
|--------------------------------------------------------------------------
|
| GET /api/market/listings
|
| Query params (all optional):
|   kind            PRODUCE | EQUIPMENT | INPUTS
|   category        one key or comma separated keys
|   search          matches title, variety, brand, model, composition
|   state, district, taluka
|   minPrice, maxPrice
|   condition       equipment condition
|   isOrganic       true
|   deliveryAvailable true
|   seller          seller user id
|   excludeMine     true -> hide the current user's listings
|   sort            newest (default) | oldest | price_asc | price_desc
|   page, limit     pagination (limit max 50)
|
*/

export const getListings = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      kind,
      category,
      search,
      state,
      district,
      taluka,
      minPrice,
      maxPrice,
      condition,
      isOrganic,
      deliveryAvailable,
      seller,
      excludeMine,
      sort,
    } = req.query;

    const filter = { status: 'ACTIVE', $and: [notExpiredFilter()] };

    if (kind) filter.kind = String(kind).toUpperCase();

    if (category) {
      filter.category = {
        $in: String(category)
          .split(',')
          .map((value) => value.trim()),
      };
    }

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim()), 'i');

      filter.$and.push({
        $or: [
          { title: pattern },
          { variety: pattern },
          { brand: pattern },
          { model: pattern },
          { composition: pattern },
        ],
      });
    }

    if (state) filter['location.state'] = exactInsensitive(String(state));
    if (district) filter['location.district'] = exactInsensitive(String(district));
    if (taluka) filter['location.taluka'] = exactInsensitive(String(taluka));

    const min = parseNumber(minPrice);
    const max = parseNumber(maxPrice);

    if (Number.isFinite(min) || Number.isFinite(max)) {
      filter.pricePerUnit = {};
      if (Number.isFinite(min)) filter.pricePerUnit.$gte = min;
      if (Number.isFinite(max)) filter.pricePerUnit.$lte = max;
    }

    if (condition) filter.condition = condition;
    if (isOrganic === 'true') filter.isOrganic = true;
    if (deliveryAvailable === 'true') filter.deliveryAvailable = true;

    if (seller) {
      if (!isValidId(seller)) {
        return res.status(400).json({ success: false, message: 'Invalid seller ID' });
      }

      filter.seller = seller;
    } else if (excludeMine === 'true') {
      filter.seller = { $ne: userId };
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_asc: { pricePerUnit: 1, createdAt: -1 },
      price_desc: { pricePerUnit: -1, createdAt: -1 },
    };

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

    const [listings, total] = await Promise.all([
      MarketListing.find(filter)
        .populate('seller', SELLER_FIELDS)
        .sort(sortOptions[sort] || sortOptions.newest)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MarketListing.countDocuments(filter),
    ]);

    const saved = await MarketSavedListing.find({
      user: userId,
      listing: { $in: listings.map((listing) => listing._id) },
    })
      .select('listing')
      .lean();

    const savedIds = new Set(saved.map((entry) => String(entry.listing)));

    return res.status(200).json({
      success: true,
      count: listings.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      listings: listings.map((listing) => ({
        ...listing,
        isSaved: savedIds.has(String(listing._id)),
      })),
    });
  } catch (error) {
    console.error('GET MARKET LISTINGS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch listings',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY LISTINGS
|--------------------------------------------------------------------------
*/

export const getMyListings = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { status } = req.query;

    const filter = { seller: userId };

    if (status && status !== 'all') {
      filter.status = String(status).toUpperCase();
    } else {
      filter.status = { $ne: 'DELETED' };
    }

    const listings = await MarketListing.find(filter).sort({ createdAt: -1 }).lean();

    /*
     * Number of deals waiting on the seller, per listing.
     */
    const pendingCounts = await MarketDeal.aggregate([
      {
        $match: {
          listing: { $in: listings.map((listing) => listing._id) },
          status: 'PENDING',
          awaitingResponseFrom: 'SELLER',
        },
      },
      { $group: { _id: '$listing', count: { $sum: 1 } } },
    ]);

    const pendingByListing = new Map(
      pendingCounts.map((entry) => [String(entry._id), entry.count])
    );

    return res.status(200).json({
      success: true,
      count: listings.length,
      listings: listings.map((listing) => ({
        ...listing,
        pendingOffers: pendingByListing.get(String(listing._id)) || 0,
      })),
    });
  } catch (error) {
    console.error('GET MY MARKET LISTINGS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your listings',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET LISTING BY ID
|--------------------------------------------------------------------------
*/

export const getListingById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }

    const listing = await MarketListing.findById(id).populate('seller', SELLER_FIELDS).lean();

    const isOwner = listing && String(listing.seller?._id) === String(userId);

    /*
     * Paused and deleted listings are only visible to their seller.
     * Sold listings stay visible so shared links still work.
     */
    if (!listing || listing.status === 'DELETED' || (listing.status === 'PAUSED' && !isOwner)) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    if (!isOwner) {
      await MarketListing.updateOne({ _id: id }, { $inc: { views: 1 } });
    }

    const [statsFor, saved, myOpenDeal] = await Promise.all([
      getSellerStats([listing.seller._id]),
      MarketSavedListing.exists({ user: userId, listing: id }),
      isOwner
        ? null
        : MarketDeal.findOne({
            listing: id,
            buyer: userId,
            status: { $in: ['PENDING', 'ACCEPTED'] },
          })
            .select('_id status awaitingResponseFrom quantity pricePerUnit')
            .lean(),
    ]);

    return res.status(200).json({
      success: true,
      listing: {
        ...listing,
        isOwner,
        isSaved: Boolean(saved),
        isExpired: Boolean(listing.expiryDate && new Date(listing.expiryDate) <= new Date()),
        sellerStats: statsFor(listing.seller._id),
        myOpenDeal: myOpenDeal || null,
      },
    });
  } catch (error) {
    console.error('GET MARKET LISTING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch listing',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE LISTING
|--------------------------------------------------------------------------
*/

export const updateListing = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }

    const listing = await MarketListing.findOne({
      _id: id,
      seller: userId,
      status: { $ne: 'DELETED' },
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found or you are not the seller',
      });
    }

    const { fields, error } = buildListingFields(req.body, { isCreate: false, existing: listing });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    /*
     * quantity is the remaining stock. Setting it to 0 marks the
     * listing sold, restocking a sold listing makes it active again.
     */
    if (fields.quantity !== undefined) {
      if (fields.quantity === 0) {
        fields.status = 'SOLD';
      } else if (listing.status === 'SOLD') {
        fields.status = 'ACTIVE';
      }
    }

    const updated = await MarketListing.findOneAndUpdate(
      { _id: id, seller: userId, status: { $ne: 'DELETED' } },
      { $set: fields },
      { returnDocument: 'after', runValidators: true }
    ).populate('seller', SELLER_FIELDS);

    if (fields.status === 'SOLD') {
      await closeOpenDeals(id, 'Listing marked as sold out by the seller');
    }

    return res.status(200).json({
      success: true,
      message: 'Listing updated successfully',
      listing: updated,
    });
  } catch (error) {
    console.error('UPDATE MARKET LISTING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update listing',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| PAUSE / RESUME LISTING
|--------------------------------------------------------------------------
|
| PATCH /api/market/listings/:id/status   { "status": "PAUSED" | "ACTIVE" }
|
*/

export const updateListingStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }

    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be ACTIVE or PAUSED',
      });
    }

    const from = status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

    const listing = await MarketListing.findOneAndUpdate(
      { _id: id, seller: userId, status: from },
      { $set: { status } },
      { returnDocument: 'after' }
    );

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: `No ${from.toLowerCase()} listing found with this ID`,
      });
    }

    return res.status(200).json({
      success: true,
      message: status === 'ACTIVE' ? 'Listing resumed' : 'Listing paused',
      listing,
    });
  } catch (error) {
    console.error('UPDATE MARKET LISTING STATUS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update listing status',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DELETE LISTING
|--------------------------------------------------------------------------
|
| Soft delete. Not allowed while an accepted deal is still open, so a
| buyer never loses a deal they were promised. Pending offers are
| cancelled.
|
*/

export const deleteListing = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }

    const listing = await MarketListing.findOne({
      _id: id,
      seller: userId,
      status: { $ne: 'DELETED' },
    });

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    const acceptedDeals = await MarketDeal.countDocuments({ listing: id, status: 'ACCEPTED' });

    if (acceptedDeals > 0) {
      return res.status(409).json({
        success: false,
        message: 'Complete or cancel the accepted deals on this listing before deleting it',
      });
    }

    listing.status = 'DELETED';
    await listing.save();

    await closeOpenDeals(id, 'Listing removed by the seller');

    return res.status(200).json({
      success: true,
      message: 'Listing deleted successfully',
    });
  } catch (error) {
    console.error('DELETE MARKET LISTING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete listing',
      error: error.message,
    });
  }
};

/*
 * Cancel every pending deal on a listing (used when it is sold out or
 * removed).
 */
export const closeOpenDeals = async (listingId, reason) => {
  await MarketDeal.updateMany(
    { listing: listingId, status: 'PENDING' },
    {
      $set: {
        status: 'CANCELLED',
        cancelledBy: 'SYSTEM',
        closingReason: reason,
        awaitingResponseFrom: null,
      },
    }
  );
};

/*
|--------------------------------------------------------------------------
| SAVED LISTINGS
|--------------------------------------------------------------------------
*/

export const saveListing = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }

    const listing = await MarketListing.exists({ _id: id, status: { $in: ['ACTIVE', 'SOLD'] } });

    if (!listing) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    await MarketSavedListing.updateOne(
      { user: userId, listing: id },
      { $setOnInsert: { user: userId, listing: id } },
      { upsert: true }
    );

    return res.status(200).json({ success: true, message: 'Listing saved' });
  } catch (error) {
    console.error('SAVE MARKET LISTING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save listing',
      error: error.message,
    });
  }
};

export const unsaveListing = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid listing ID' });
    }

    await MarketSavedListing.deleteOne({ user: userId, listing: id });

    return res.status(200).json({ success: true, message: 'Listing removed from saved' });
  } catch (error) {
    console.error('UNSAVE MARKET LISTING ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove saved listing',
      error: error.message,
    });
  }
};

export const getSavedListings = async (req, res) => {
  try {
    const userId = getUserId(req);

    const saved = await MarketSavedListing.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate({
        path: 'listing',
        match: { status: { $in: ['ACTIVE', 'SOLD'] } },
        populate: { path: 'seller', select: SELLER_FIELDS },
      })
      .lean();

    const listings = saved
      .filter((entry) => entry.listing)
      .map((entry) => ({ ...entry.listing, isSaved: true, savedAt: entry.createdAt }));

    return res.status(200).json({
      success: true,
      count: listings.length,
      listings,
    });
  } catch (error) {
    console.error('GET SAVED MARKET LISTINGS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch saved listings',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| SELLER PROFILE
|--------------------------------------------------------------------------
|
| GET /api/market/sellers/:userId
|
| Public seller info, rating, recent reviews and active listings.
|
*/

export const getSellerProfile = async (req, res) => {
  try {
    const { userId: sellerId } = req.params;

    if (!isValidId(sellerId)) {
      return res.status(400).json({ success: false, message: 'Invalid seller ID' });
    }

    const seller = await User.findById(sellerId).select(`${SELLER_FIELDS} createdAt`).lean();

    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const [statsFor, listings, reviews] = await Promise.all([
      getSellerStats([sellerId]),
      MarketListing.find({ seller: sellerId, status: 'ACTIVE' })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      MarketDeal.find({ seller: sellerId, status: 'COMPLETED', 'review.rating': { $ne: null } })
        .select('review listingSnapshot.title buyer')
        .populate('buyer', 'fullName village district')
        .sort({ 'review.createdAt': -1 })
        .limit(20)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      seller: {
        ...seller,
        stats: statsFor(sellerId),
      },
      listings,
      reviews: reviews.map((deal) => ({
        rating: deal.review.rating,
        comment: deal.review.comment,
        createdAt: deal.review.createdAt,
        item: deal.listingSnapshot.title,
        buyer: deal.buyer,
      })),
    });
  } catch (error) {
    console.error('GET MARKET SELLER PROFILE ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch seller profile',
      error: error.message,
    });
  }
};
