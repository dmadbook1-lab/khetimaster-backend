import mongoose from 'mongoose';

import MarketDeal from '../models/MarketDeal.js';
import MarketListing from '../models/MarketListing.js';

import { closeOpenDeals } from './marketListingController.js';

import { DISCRETE_UNITS } from '../data/marketCategories.js';

const PARTY_FIELDS = 'fullName phoneNumber village taluka district state';

/*
 * Treat anything below this as zero stock (avoids float leftovers like
 * 0.0000000001 after decimal quantities).
 */
const QUANTITY_EPSILON = 0.0005;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getUserId = (req) => req.user?.userId || null;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const roundQuantity = (value) => Math.round(value * 1000) / 1000;

const roundMoney = (value) => Math.round(value * 100) / 100;

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const trimMessage = (value) => (typeof value === 'string' ? value.trim().slice(0, 500) : '');

const isExpired = (listing) => Boolean(listing.expiryDate && listing.expiryDate <= new Date());

const expiredResponse = (res) =>
  res.status(400).json({
    success: false,
    message: 'This product has passed its expiry date and cannot be sold',
  });

const getRole = (deal, userId) => {
  const buyerId = String(deal.buyer?._id || deal.buyer);
  const sellerId = String(deal.seller?._id || deal.seller);

  if (buyerId === String(userId)) return 'BUYER';
  if (sellerId === String(userId)) return 'SELLER';
  return null;
};

/*
 * Phone numbers are only shared once a deal has been accepted.
 */
const formatDeal = (deal, userId) => {
  const plain = typeof deal.toObject === 'function' ? deal.toObject() : deal;
  const shareContact = ['ACCEPTED', 'COMPLETED'].includes(plain.status);

  const party = (user) => {
    if (!user || typeof user !== 'object' || !user._id) return user;
    if (shareContact) return user;

    const { phoneNumber, ...rest } = user;
    return rest;
  };

  const myRole = getRole(plain, userId);

  return {
    ...plain,
    buyer: party(plain.buyer),
    seller: party(plain.seller),
    myRole,
    isMyTurn: plain.status === 'PENDING' && plain.awaitingResponseFrom === myRole,
  };
};

const populateDeal = (query) =>
  query
    .populate('buyer', PARTY_FIELDS)
    .populate('seller', PARTY_FIELDS)
    .populate('listing', 'title images status quantity unit pricePerUnit location');

/*
 * Validates a proposed quantity against a listing.
 *
 * Returns an error message or null.
 */
const validateQuantity = (quantity, listing) => {
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
    return 'A valid quantity is required';
  }

  if (DISCRETE_UNITS.includes(listing.unit) && !Number.isInteger(quantity)) {
    return `Quantity must be a whole number of ${listing.unit}`;
  }

  if (quantity > listing.quantity + QUANTITY_EPSILON) {
    return `Only ${listing.quantity} ${listing.unit} available`;
  }

  /*
   * If less than the minimum order is left, the buyer may take
   * whatever remains.
   */
  const minimum = Math.min(listing.minOrderQuantity || 0, listing.quantity);

  if (quantity + QUANTITY_EPSILON < minimum) {
    return `Minimum order is ${minimum} ${listing.unit}`;
  }

  return null;
};

const validatePrice = (price) => {
  if (price === null || !Number.isFinite(price) || price <= 0) {
    return 'A valid price per unit is required';
  }

  return null;
};

/*
 * Atomically reserve stock on a listing. Returns the updated listing or
 * null if there wasn't enough stock.
 */
const reserveStock = (listingId, quantity) =>
  MarketListing.findOneAndUpdate(
    {
      _id: listingId,
      status: { $in: ['ACTIVE', 'PAUSED'] },
      quantity: { $gte: quantity - QUANTITY_EPSILON },
      $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }],
    },
    { $inc: { quantity: -quantity } },
    { returnDocument: 'after' }
  );

/*
 * Give stock back to a listing (accepted deal cancelled). A sold out
 * listing becomes active again.
 */
const releaseStock = async (listingId, quantity) => {
  const listing = await MarketListing.findOneAndUpdate(
    { _id: listingId, status: { $ne: 'DELETED' } },
    { $inc: { quantity } },
    { returnDocument: 'after' }
  );

  if (listing && listing.status === 'SOLD' && listing.quantity > QUANTITY_EPSILON) {
    await MarketListing.updateOne(
      { _id: listingId, status: 'SOLD' },
      { $set: { status: 'ACTIVE' } }
    );
  }
};

/*
 * After stock is reserved, mark the listing sold once nothing is left
 * and close the remaining offers.
 */
const markSoldIfEmpty = async (listing) => {
  if (listing.quantity > QUANTITY_EPSILON) return;

  const result = await MarketListing.updateOne(
    {
      _id: listing._id,
      quantity: { $lte: QUANTITY_EPSILON },
      status: { $in: ['ACTIVE', 'PAUSED'] },
    },
    { $set: { status: 'SOLD', quantity: 0 } }
  );

  if (result.modifiedCount > 0) {
    await closeOpenDeals(listing._id, 'Listing sold out');
  }
};

/*
 * Loads a deal the current user is part of. Sends the error response
 * itself and returns null when the deal can't be used.
 */
const loadDealForUser = async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;

  if (!isValidId(id)) {
    res.status(400).json({ success: false, message: 'Invalid deal ID' });
    return null;
  }

  const deal = await MarketDeal.findById(id);

  if (!deal) {
    res.status(404).json({ success: false, message: 'Deal not found' });
    return null;
  }

  const role = getRole(deal, userId);

  if (!role) {
    res.status(403).json({ success: false, message: 'You are not part of this deal' });
    return null;
  }

  return { deal, role, userId };
};

const respondWithDeal = async (res, dealId, userId, status, message) => {
  const deal = await populateDeal(MarketDeal.findById(dealId)).lean();

  return res.status(status).json({
    success: true,
    message,
    deal: formatDeal(deal, userId),
  });
};

const staleDealResponse = (res) =>
  res.status(409).json({
    success: false,
    message: 'This deal was updated by the other party. Please refresh and try again.',
  });

/*
|--------------------------------------------------------------------------
| CREATE DEAL (BUYER MAKES AN OFFER)
|--------------------------------------------------------------------------
|
| POST /api/market/deals
|
| {
|   "listingId": "...",
|   "quantity": 10,
|   "pricePerUnit": 4500,        // optional, defaults to listed price
|   "message": "Can pick up Sunday",
|   "fulfilment": "PICKUP" | "DELIVERY",
|   "deliveryAddress": "..."     // required for DELIVERY
| }
|
*/

export const createDeal = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { listingId, message, fulfilment = 'PICKUP', deliveryAddress } = req.body;

    if (!isValidId(listingId)) {
      return res.status(400).json({ success: false, message: 'A valid listing ID is required' });
    }

    const listing = await MarketListing.findOne({ _id: listingId, status: 'ACTIVE' });

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'This listing is no longer available',
      });
    }

    if (String(listing.seller) === String(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot buy your own listing',
      });
    }

    if (isExpired(listing)) return expiredResponse(res);

    const quantity = parseNumber(req.body.quantity);

    const quantityError = validateQuantity(quantity, listing);

    if (quantityError) {
      return res.status(400).json({ success: false, message: quantityError });
    }

    let pricePerUnit = parseNumber(req.body.pricePerUnit) ?? listing.pricePerUnit;

    const priceError = validatePrice(pricePerUnit);

    if (priceError) {
      return res.status(400).json({ success: false, message: priceError });
    }

    pricePerUnit = roundMoney(pricePerUnit);

    if (!listing.isNegotiable && pricePerUnit !== listing.pricePerUnit) {
      return res.status(400).json({
        success: false,
        message: 'The price of this listing is fixed',
      });
    }

    if (!['PICKUP', 'DELIVERY'].includes(fulfilment)) {
      return res.status(400).json({
        success: false,
        message: 'Fulfilment must be PICKUP or DELIVERY',
      });
    }

    if (fulfilment === 'DELIVERY') {
      if (!listing.deliveryAvailable) {
        return res.status(400).json({
          success: false,
          message: 'The seller does not deliver this item. Please choose pickup.',
        });
      }

      if (!deliveryAddress || !String(deliveryAddress).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Delivery address is required for delivery',
        });
      }
    }

    const existing = await MarketDeal.findOne({
      listing: listingId,
      buyer: userId,
      status: 'PENDING',
    }).select('_id');

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'You already have an open offer on this listing',
        dealId: existing._id,
      });
    }

    const finalQuantity = roundQuantity(quantity);
    const offerMessage = trimMessage(message);

    const deal = await MarketDeal.create({
      listing: listing._id,
      buyer: userId,
      seller: listing.seller,
      listingSnapshot: {
        title: listing.title,
        kind: listing.kind,
        category: listing.category,
        unit: listing.unit,
        image: listing.images[0] || '',
        listedPricePerUnit: listing.pricePerUnit,
      },
      quantity: finalQuantity,
      pricePerUnit,
      totalAmount: roundMoney(finalQuantity * pricePerUnit),
      fulfilment,
      deliveryAddress: fulfilment === 'DELIVERY' ? String(deliveryAddress).trim() : '',
      status: 'PENDING',
      awaitingResponseFrom: 'SELLER',
      history: [
        {
          by: 'BUYER',
          action: 'OFFER',
          quantity: finalQuantity,
          pricePerUnit,
          message: offerMessage,
        },
      ],
    });

    return respondWithDeal(res, deal._id, userId, 201, 'Offer sent to the seller');
  } catch (error) {
    console.error('CREATE MARKET DEAL ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send offer',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY DEALS
|--------------------------------------------------------------------------
|
| GET /api/market/deals
|
| Query params:
|   role       buying | selling (default: both)
|   status     PENDING | ACCEPTED | COMPLETED | REJECTED | CANCELLED
|              | open (PENDING + ACCEPTED) | all (default)
|   listingId  only deals for one listing
|   page, limit
|
*/

export const getMyDeals = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { role, status, listingId } = req.query;

    const filter = {};

    if (role === 'buying') {
      filter.buyer = userId;
    } else if (role === 'selling') {
      filter.seller = userId;
    } else {
      filter.$or = [{ buyer: userId }, { seller: userId }];
    }

    if (status === 'open') {
      filter.status = { $in: ['PENDING', 'ACCEPTED'] };
    } else if (status && status !== 'all') {
      filter.status = String(status).toUpperCase();
    }

    if (listingId) {
      if (!isValidId(listingId)) {
        return res.status(400).json({ success: false, message: 'Invalid listing ID' });
      }

      filter.listing = listingId;
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

    const [deals, total] = await Promise.all([
      populateDeal(MarketDeal.find(filter))
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MarketDeal.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: deals.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      deals: deals.map((deal) => formatDeal(deal, userId)),
    });
  } catch (error) {
    console.error('GET MARKET DEALS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch deals',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET DEAL BY ID
|--------------------------------------------------------------------------
*/

export const getDealById = async (req, res) => {
  try {
    const loaded = await loadDealForUser(req, res);
    if (!loaded) return;

    return respondWithDeal(res, loaded.deal._id, loaded.userId, 200, 'Deal fetched');
  } catch (error) {
    console.error('GET MARKET DEAL ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch deal',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| COUNTER OFFER
|--------------------------------------------------------------------------
|
| PATCH /api/market/deals/:id/counter
|
| { "pricePerUnit": 4300, "quantity": 8, "message": "..." }
|
| Only the side whose turn it is can counter. The turn then passes to
| the other side.
|
*/

export const counterDeal = async (req, res) => {
  try {
    const loaded = await loadDealForUser(req, res);
    if (!loaded) return;

    const { deal, role, userId } = loaded;

    if (deal.status !== 'PENDING' || deal.awaitingResponseFrom !== role) {
      return res.status(400).json({
        success: false,
        message: 'It is not your turn to respond to this deal',
      });
    }

    const listing = await MarketListing.findOne({
      _id: deal.listing,
      status: { $in: ['ACTIVE', 'PAUSED'] },
    });

    if (!listing) {
      return res.status(400).json({
        success: false,
        message: 'This listing is no longer available',
      });
    }

    if (isExpired(listing)) return expiredResponse(res);

    const quantity = parseNumber(req.body.quantity) ?? deal.quantity;
    const pricePerUnit = parseNumber(req.body.pricePerUnit) ?? deal.pricePerUnit;

    const quantityError = validateQuantity(quantity, listing);
    if (quantityError) {
      return res.status(400).json({ success: false, message: quantityError });
    }

    const priceError = validatePrice(pricePerUnit);
    if (priceError) {
      return res.status(400).json({ success: false, message: priceError });
    }

    const finalQuantity = roundQuantity(quantity);
    const finalPrice = roundMoney(pricePerUnit);

    if (role === 'BUYER' && !listing.isNegotiable && finalPrice !== listing.pricePerUnit) {
      return res.status(400).json({
        success: false,
        message: 'The price of this listing is fixed',
      });
    }

    if (finalQuantity === deal.quantity && finalPrice === deal.pricePerUnit) {
      return res.status(400).json({
        success: false,
        message: 'Counter offer must change the price or quantity. Use accept instead.',
      });
    }

    const updated = await MarketDeal.findOneAndUpdate(
      { _id: deal._id, status: 'PENDING', awaitingResponseFrom: role },
      {
        $set: {
          quantity: finalQuantity,
          pricePerUnit: finalPrice,
          totalAmount: roundMoney(finalQuantity * finalPrice),
          awaitingResponseFrom: role === 'BUYER' ? 'SELLER' : 'BUYER',
        },
        $push: {
          history: {
            by: role,
            action: 'COUNTER',
            quantity: finalQuantity,
            pricePerUnit: finalPrice,
            message: trimMessage(req.body.message),
          },
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) return staleDealResponse(res);

    return respondWithDeal(res, deal._id, userId, 200, 'Counter offer sent');
  } catch (error) {
    console.error('COUNTER MARKET DEAL ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send counter offer',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACCEPT DEAL
|--------------------------------------------------------------------------
|
| PATCH /api/market/deals/:id/accept
|
| The side whose turn it is accepts the current terms. The quantity is
| reserved on the listing straight away.
|
*/

export const acceptDeal = async (req, res) => {
  try {
    const loaded = await loadDealForUser(req, res);
    if (!loaded) return;

    const { deal, role, userId } = loaded;

    if (deal.status !== 'PENDING' || deal.awaitingResponseFrom !== role) {
      return res.status(400).json({
        success: false,
        message: 'It is not your turn to respond to this deal',
      });
    }

    const listing = await reserveStock(deal.listing, deal.quantity);

    if (!listing) {
      return res.status(409).json({
        success: false,
        message:
          'Not enough quantity is available on this listing anymore, or the product has expired',
      });
    }

    const updated = await MarketDeal.findOneAndUpdate(
      {
        _id: deal._id,
        status: 'PENDING',
        awaitingResponseFrom: role,
        quantity: deal.quantity,
        pricePerUnit: deal.pricePerUnit,
      },
      {
        $set: {
          status: 'ACCEPTED',
          awaitingResponseFrom: null,
          acceptedAt: new Date(),
        },
        $push: {
          history: {
            by: role,
            action: 'ACCEPT',
            quantity: deal.quantity,
            pricePerUnit: deal.pricePerUnit,
            message: trimMessage(req.body?.message),
          },
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      await releaseStock(deal.listing, deal.quantity);
      return staleDealResponse(res);
    }

    await markSoldIfEmpty(listing);

    return respondWithDeal(
      res,
      deal._id,
      userId,
      200,
      'Deal accepted. You can now see each other’s contact details.'
    );
  } catch (error) {
    console.error('ACCEPT MARKET DEAL ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept deal',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| REJECT DEAL
|--------------------------------------------------------------------------
*/

export const rejectDeal = async (req, res) => {
  try {
    const loaded = await loadDealForUser(req, res);
    if (!loaded) return;

    const { deal, role, userId } = loaded;

    if (deal.status !== 'PENDING' || deal.awaitingResponseFrom !== role) {
      return res.status(400).json({
        success: false,
        message: 'It is not your turn to respond to this deal',
      });
    }

    const reason = trimMessage(req.body?.reason);

    const updated = await MarketDeal.findOneAndUpdate(
      { _id: deal._id, status: 'PENDING', awaitingResponseFrom: role },
      {
        $set: { status: 'REJECTED', awaitingResponseFrom: null, closingReason: reason },
        $push: { history: { by: role, action: 'REJECT', message: reason } },
      },
      { returnDocument: 'after' }
    );

    if (!updated) return staleDealResponse(res);

    return respondWithDeal(res, deal._id, userId, 200, 'Offer rejected');
  } catch (error) {
    console.error('REJECT MARKET DEAL ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject deal',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| CANCEL DEAL
|--------------------------------------------------------------------------
|
| Either side can cancel a PENDING or ACCEPTED deal. Cancelling an
| accepted deal gives the reserved quantity back to the listing.
|
*/

export const cancelDeal = async (req, res) => {
  try {
    const loaded = await loadDealForUser(req, res);
    if (!loaded) return;

    const { deal, role, userId } = loaded;

    if (!['PENDING', 'ACCEPTED'].includes(deal.status)) {
      return res.status(400).json({
        success: false,
        message: `A ${deal.status.toLowerCase()} deal cannot be cancelled`,
      });
    }

    const reason = trimMessage(req.body?.reason);

    const updated = await MarketDeal.findOneAndUpdate(
      { _id: deal._id, status: deal.status },
      {
        $set: {
          status: 'CANCELLED',
          awaitingResponseFrom: null,
          cancelledBy: role,
          closingReason: reason,
        },
        $push: { history: { by: role, action: 'CANCEL', message: reason } },
      },
      { returnDocument: 'after' }
    );

    if (!updated) return staleDealResponse(res);

    if (deal.status === 'ACCEPTED') {
      await releaseStock(deal.listing, deal.quantity);
    }

    return respondWithDeal(res, deal._id, userId, 200, 'Deal cancelled');
  } catch (error) {
    console.error('CANCEL MARKET DEAL ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel deal',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| COMPLETE DEAL
|--------------------------------------------------------------------------
|
| Seller confirms the goods were handed over and payment received.
|
*/

export const completeDeal = async (req, res) => {
  try {
    const loaded = await loadDealForUser(req, res);
    if (!loaded) return;

    const { deal, role, userId } = loaded;

    if (role !== 'SELLER') {
      return res.status(403).json({
        success: false,
        message: 'Only the seller can mark a deal as completed',
      });
    }

    const updated = await MarketDeal.findOneAndUpdate(
      { _id: deal._id, status: 'ACCEPTED' },
      {
        $set: { status: 'COMPLETED', completedAt: new Date() },
        $push: {
          history: { by: role, action: 'COMPLETE', message: trimMessage(req.body?.message) },
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: 'Only accepted deals can be completed',
      });
    }

    return respondWithDeal(res, deal._id, userId, 200, 'Deal marked as completed');
  } catch (error) {
    console.error('COMPLETE MARKET DEAL ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete deal',
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| REVIEW SELLER
|--------------------------------------------------------------------------
|
| POST /api/market/deals/:id/review   { "rating": 1-5, "comment": "..." }
|
| Buyer rates the seller once the deal is completed. One review per deal.
|
*/

export const reviewDeal = async (req, res) => {
  try {
    const loaded = await loadDealForUser(req, res);
    if (!loaded) return;

    const { deal, role, userId } = loaded;

    if (role !== 'BUYER') {
      return res.status(403).json({
        success: false,
        message: 'Only the buyer can review this deal',
      });
    }

    const rating = Number(req.body.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a whole number from 1 to 5',
      });
    }

    const updated = await MarketDeal.findOneAndUpdate(
      { _id: deal._id, status: 'COMPLETED', 'review.rating': null },
      {
        $set: {
          'review.rating': rating,
          'review.comment': trimMessage(req.body.comment),
          'review.createdAt': new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message:
          deal.status !== 'COMPLETED'
            ? 'You can review only after the deal is completed'
            : 'You have already reviewed this deal',
      });
    }

    return respondWithDeal(res, deal._id, userId, 200, 'Thank you for your review');
  } catch (error) {
    console.error('REVIEW MARKET DEAL ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: error.message,
    });
  }
};
