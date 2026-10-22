import mongoose from 'mongoose';

import NurseryCart from '../models/NurseryCart.js';
import NurseryOrder from '../models/NurseryOrder.js';
import Plant from '../models/Plant.js';
import User from '../models/User.js';

import { ORDER_FLOW, CANCELLABLE_STATUSES, calculateDeliveryFee } from '../data/nurseryOptions.js';

/*
|--------------------------------------------------------------------------
| ORDER STATUS MODEL
|--------------------------------------------------------------------------
|
| An order can contain plants from several sellers. Every item has its
| own status, moved forward by that item's seller:
|
|   PENDING -> CONFIRMED -> DISPATCHED -> OUT_FOR_DELIVERY -> DELIVERED
|
| or CANCELLED while still PENDING / CONFIRMED (stock is restored).
|
| orderStatus is derived: the least advanced item that isn't cancelled,
| or CANCELLED when every item is. Older orders have no item status; for
| them orderStatus applies to every item.
|
*/

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

const trimText = (value, max = 500) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const unauthorized = (res) =>
  res.status(401).json({
    success: false,
    message: 'Authentication required',
  });

const itemStatus = (item, order) => item.status || order.orderStatus;

const isSellerOf = (item, userId) => String(item.seller?.userId) === String(userId);

/*
 * Give each item of an older order its own status before changing it.
 */
const materializeItemStatuses = (order) => {
  for (const item of order.items) {
    if (!item.status) item.status = order.orderStatus;
  }
};

/*
 * Recalculate orderStatus (and COD payment) from the item statuses.
 */
const deriveOrderStatus = (order) => {
  const active = order.items
    .map((item) => itemStatus(item, order))
    .filter((s) => s !== 'CANCELLED');

  if (active.length === 0) {
    order.orderStatus = 'CANCELLED';
    return;
  }

  order.orderStatus = ORDER_FLOW[Math.min(...active.map((s) => ORDER_FLOW.indexOf(s)))];

  if (order.orderStatus === 'DELIVERED') {
    order.deliveredAt = order.deliveredAt || new Date();

    // Cash on delivery: delivered means paid
    if (order.paymentMethod === 'COD') order.paymentStatus = 'PAID';
  }
};

const restoreStock = async (items) => {
  for (const item of items) {
    if (!item.plant) continue;

    await Plant.updateOne(
      { _id: item.plant._id || item.plant },
      { $inc: { quantity: item.quantity } }
    );
  }
};

const conflictResponse = (res) =>
  res.status(409).json({
    success: false,
    message: 'This order was just updated. Please refresh and try again.',
  });

/*
 * Buyer view: every item carries its effective status. With
 * includeContacts, sellers' phone numbers are added for items the
 * seller has confirmed.
 */
const toBuyerView = async (order, { includeContacts = false } = {}) => {
  const plain = typeof order.toObject === 'function' ? order.toObject() : order;

  let phones = new Map();

  if (includeContacts) {
    const confirmedSellerIds = plain.items
      .filter((item) => !['PENDING', 'CANCELLED'].includes(itemStatus(item, plain)))
      .map((item) => item.seller.userId);

    if (confirmedSellerIds.length > 0) {
      const sellers = await User.find({ _id: { $in: confirmedSellerIds } })
        .select('phoneNumber')
        .lean();

      phones = new Map(sellers.map((seller) => [String(seller._id), seller.phoneNumber]));
    }
  }

  return {
    ...plain,
    items: plain.items.map((item) => {
      const phoneNumber = phones.get(String(item.seller.userId));

      return {
        ...item,
        status: itemStatus(item, plain),
        seller: phoneNumber ? { ...item.seller, phoneNumber } : item.seller,
        canReview: itemStatus(item, plain) === 'DELIVERED' && !item.review?.rating,
      };
    }),
    canCancel:
      plain.items.every((item) =>
        ['CANCELLED', ...CANCELLABLE_STATUSES].includes(itemStatus(item, plain))
      ) && plain.orderStatus !== 'CANCELLED',
  };
};

/*
 * Seller view: only this seller's items, their subtotal and status.
 */
const toSellerView = (order, sellerId) => {
  const plain = typeof order.toObject === 'function' ? order.toObject() : order;

  const items = plain.items
    .filter((item) => isSellerOf(item, sellerId))
    .map((item) => ({ ...item, status: itemStatus(item, plain) }));

  const active = items.map((item) => item.status).filter((s) => s !== 'CANCELLED');

  return {
    _id: plain._id,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    deliveryAddress: plain.deliveryAddress,
    paymentMethod: plain.paymentMethod,
    paymentStatus: plain.paymentStatus,
    orderStatus: plain.orderStatus,
    items,
    sellerSubtotal: items
      .filter((item) => item.status !== 'CANCELLED')
      .reduce((sum, item) => sum + item.total, 0),
    sellerStatus:
      active.length === 0
        ? 'CANCELLED'
        : ORDER_FLOW[Math.min(...active.map((s) => ORDER_FLOW.indexOf(s)))],
  };
};

const paginate = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

  return { page, limit, skip: (page - 1) * limit };
};

/*
|--------------------------------------------------------------------------
| CREATE ORDER (CHECKOUT)
|--------------------------------------------------------------------------
| POST /api/nursery/orders
|
| { "deliveryAddress": { fullName, phoneNumber, address, village, taluka,
|                        district, state, pincode } }
|
| The whole cart is ordered, cash on delivery. Prices come from the
| plants, never from the app. If any item can't be ordered, nothing is
| ordered: stock already taken is put back and the cart is restored.
|--------------------------------------------------------------------------
*/

export const createOrder = async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) return unauthorized(res);

  /* DELIVERY ADDRESS */

  const deliveryAddress = req.body?.deliveryAddress;

  if (!deliveryAddress || typeof deliveryAddress !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Delivery address is required',
    });
  }

  const address = {
    fullName: trimText(deliveryAddress.fullName, 100),
    phoneNumber: trimText(deliveryAddress.phoneNumber, 20),
    address: trimText(deliveryAddress.address, 300),
    village: trimText(deliveryAddress.village, 100),
    taluka: trimText(deliveryAddress.taluka, 100),
    district: trimText(deliveryAddress.district, 100),
    state: trimText(deliveryAddress.state, 100),
    pincode: trimText(deliveryAddress.pincode, 10),
  };

  if (!address.fullName || !address.phoneNumber || !address.address || !address.pincode) {
    return res.status(400).json({
      success: false,
      message: 'Full name, phone number, address and pincode are required',
    });
  }

  if (!/^\+?[0-9\s-]{10,15}$/.test(address.phoneNumber)) {
    return res.status(400).json({ success: false, message: 'Invalid phone number' });
  }

  if (!/^\d{6}$/.test(address.pincode)) {
    return res.status(400).json({ success: false, message: 'Pincode must be 6 digits' });
  }

  /*
   * Claim the cart: empty it atomically so a double tap on "Place
   * order" can't create two orders from the same cart.
   */
  const claimedCart = await NurseryCart.findOneAndUpdate(
    { user: userId, 'items.0': { $exists: true } },
    { $set: { items: [] } },
    { returnDocument: 'before' }
  );

  if (!claimedCart) {
    return res.status(400).json({
      success: false,
      message: 'Your cart is empty',
    });
  }

  const cartItems = claimedCart.items.map((item) => ({
    plant: item.plant,
    quantity: item.quantity,
  }));

  const reserved = [];

  const rollback = async () => {
    await restoreStock(reserved);
    await NurseryCart.updateOne({ user: userId }, { $push: { items: { $each: cartItems } } });
  };

  const fail = async (status, message) => {
    await rollback();
    return res.status(status).json({ success: false, message });
  };

  try {
    const orderItems = [];
    let subtotal = 0;

    for (const cartItem of cartItems) {
      const plant = await Plant.findById(cartItem.plant);

      if (!plant || !plant.isActive) {
        return fail(400, `${plant?.name || 'One of the plants'} is no longer available`);
      }

      if (!plant.seller?.userId) {
        return fail(400, `${plant.name} has invalid seller information`);
      }

      if (String(plant.seller.userId) === String(userId)) {
        return fail(400, `You cannot buy your own plant (${plant.name})`);
      }

      const quantity = Number(cartItem.quantity);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return fail(400, `Invalid quantity for ${plant.name}`);
      }

      /*
       * Atomic stock reservation: two buyers can never both get the
       * last plants.
       */
      const updatedPlant = await Plant.findOneAndUpdate(
        { _id: plant._id, isActive: true, quantity: { $gte: quantity } },
        { $inc: { quantity: -quantity } },
        { returnDocument: 'after' }
      );

      if (!updatedPlant) {
        return fail(
          400,
          plant.quantity > 0
            ? `Only ${plant.quantity} of ${plant.name} left. Please update your cart.`
            : `${plant.name} is out of stock`
        );
      }

      reserved.push({ plant: updatedPlant._id, quantity });

      const price = Number(updatedPlant.price);
      const itemTotal = price * quantity;

      subtotal += itemTotal;

      orderItems.push({
        plant: updatedPlant._id,
        name: updatedPlant.name,
        image: updatedPlant.images?.[0] || '',
        seller: {
          userId: updatedPlant.seller.userId,
          name: updatedPlant.seller.name || 'Seller',
        },
        price,
        quantity,
        total: itemTotal,
        status: 'PENDING',
      });
    }

    const deliveryFee = calculateDeliveryFee(subtotal);

    const order = await NurseryOrder.create({
      user: userId,
      items: orderItems,
      deliveryAddress: address,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      orderStatus: 'PENDING',
    });

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: await toBuyerView(order),
    });
  } catch (error) {
    console.error('Create nursery order error:', error);

    await rollback();

    return res.status(500).json({
      success: false,
      message: 'Failed to place order',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET MY ORDERS (BUYER)
|--------------------------------------------------------------------------
| GET /api/nursery/orders?status=PENDING|...|active|all&page=1&limit=20
|--------------------------------------------------------------------------
*/

export const getMyOrders = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const filter = { user: userId };
    const { status } = req.query;

    if (status === 'active') {
      filter.orderStatus = { $nin: ['DELIVERED', 'CANCELLED'] };
    } else if (status && status !== 'all') {
      filter.orderStatus = String(status).toUpperCase();
    }

    const { page, limit, skip } = paginate(req.query);

    const [orders, total] = await Promise.all([
      NurseryOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      NurseryOrder.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: await Promise.all(orders.map((order) => toBuyerView(order))),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get nursery orders error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET SINGLE ORDER (BUYER)
|--------------------------------------------------------------------------
| GET /api/nursery/orders/:id
|
| Sellers' phone numbers are included for items they have confirmed.
|--------------------------------------------------------------------------
*/

export const getOrderById = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID',
      });
    }

    const order = await NurseryOrder.findOne({ _id: id, user: userId }).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: await toBuyerView(order, { includeContacts: true }),
    });
  } catch (error) {
    console.error('Get nursery order error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
    });
  }
};

/*
|--------------------------------------------------------------------------
| CANCEL ORDER (BUYER)
|--------------------------------------------------------------------------
| PUT /api/nursery/orders/:id/cancel   { "reason": "..." }
|
| Allowed while no item has been dispatched. Stock is restored.
|--------------------------------------------------------------------------
*/

export const cancelOrder = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID',
      });
    }

    const order = await NurseryOrder.findOne({ _id: id, user: userId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (order.orderStatus === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'This order is already cancelled',
      });
    }

    const canCancel = order.items.every((item) =>
      ['CANCELLED', ...CANCELLABLE_STATUSES].includes(itemStatus(item, order))
    );

    if (!canCancel) {
      return res.status(400).json({
        success: false,
        message: 'This order can no longer be cancelled',
      });
    }

    materializeItemStatuses(order);

    const toRestore = order.items.filter((item) => item.status !== 'CANCELLED');
    const reason = trimText(req.body?.reason);

    for (const item of toRestore) {
      item.status = 'CANCELLED';
      item.statusUpdatedAt = new Date();
      item.cancellationReason = reason;
    }

    order.cancelledBy = 'BUYER';
    order.cancellationReason = reason;
    deriveOrderStatus(order);

    // Throws VersionError if a seller changed the order meanwhile
    await order.save();

    await restoreStock(toRestore);

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: await toBuyerView(order),
    });
  } catch (error) {
    if (error.name === 'VersionError') return conflictResponse(res);

    console.error('Cancel nursery order error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
    });
  }
};

/*
|--------------------------------------------------------------------------
| SELLER ORDERS
|--------------------------------------------------------------------------
| GET /api/nursery/orders/seller?status=PENDING|...|active|all&page=1
|
| Orders that contain the seller's plants, showing only their items.
| Without status: active (not yet delivered or cancelled).
|--------------------------------------------------------------------------
*/

export const getSellerOrders = async (req, res) => {
  try {
    const sellerId = getAuthenticatedUserId(req);
    if (!sellerId) return unauthorized(res);

    const seller = new mongoose.Types.ObjectId(String(sellerId));
    const status = String(req.query.status || 'active').toUpperCase();

    let statuses = null;

    if (status === 'ACTIVE') {
      statuses = ORDER_FLOW.filter((s) => s !== 'DELIVERED');
    } else if (status !== 'ALL') {
      statuses = [status];
    }

    /*
     * Match on the seller's items: their own status, or for older
     * orders without item status, the order status.
     */
    const filter = statuses
      ? {
          $or: [
            { items: { $elemMatch: { 'seller.userId': seller, status: { $in: statuses } } } },
            {
              items: { $elemMatch: { 'seller.userId': seller, status: null } },
              orderStatus: { $in: statuses },
            },
          ],
        }
      : { 'items.seller.userId': seller };

    const { page, limit, skip } = paginate(req.query);

    const [orders, total] = await Promise.all([
      NurseryOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      NurseryOrder.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: orders.map((order) => toSellerView(order, sellerId)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get nursery seller orders error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch seller orders',
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE SELLER STATUS
|--------------------------------------------------------------------------
| PATCH /api/nursery/orders/:id/seller-status
|
| { "status": "CONFIRMED" | "DISPATCHED" | "OUT_FOR_DELIVERY" |
|             "DELIVERED" | "CANCELLED", "reason": "..." }
|
| Applies to all of the seller's items in the order. Statuses only move
| forward (steps may be skipped, e.g. CONFIRMED -> DELIVERED for local
| pickup). CANCELLED is allowed while PENDING / CONFIRMED and restores
| stock.
|--------------------------------------------------------------------------
*/

export const updateSellerOrderStatus = async (req, res) => {
  try {
    const sellerId = getAuthenticatedUserId(req);
    if (!sellerId) return unauthorized(res);

    const { id } = req.params;
    const newStatus = String(req.body?.status || '').toUpperCase();

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID',
      });
    }

    if (newStatus === 'PENDING' || ![...ORDER_FLOW, 'CANCELLED'].includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be CONFIRMED, DISPATCHED, OUT_FOR_DELIVERY, DELIVERED or CANCELLED',
      });
    }

    const order = await NurseryOrder.findOne({ _id: id, 'items.seller.userId': sellerId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const myItems = order.items.filter(
      (item) => isSellerOf(item, sellerId) && itemStatus(item, order) !== 'CANCELLED'
    );

    if (myItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your items in this order are already cancelled',
      });
    }

    if (newStatus === 'CANCELLED') {
      if (!myItems.every((item) => CANCELLABLE_STATUSES.includes(itemStatus(item, order)))) {
        return res.status(400).json({
          success: false,
          message: 'Items that are already dispatched cannot be cancelled',
        });
      }
    } else {
      const target = ORDER_FLOW.indexOf(newStatus);

      if (myItems.some((item) => ORDER_FLOW.indexOf(itemStatus(item, order)) >= target)) {
        return res.status(400).json({
          success: false,
          message: `Your items are already ${itemStatus(myItems[0], order)}`,
        });
      }
    }

    materializeItemStatuses(order);

    const reason = trimText(req.body?.reason);

    for (const item of myItems) {
      item.status = newStatus;
      item.statusUpdatedAt = new Date();
      if (newStatus === 'CANCELLED') item.cancellationReason = reason;
    }

    deriveOrderStatus(order);

    if (order.orderStatus === 'CANCELLED') {
      order.cancelledBy = 'SELLER';
      order.cancellationReason = reason;
    }

    // Throws VersionError if the buyer changed the order meanwhile
    await order.save();

    if (newStatus === 'CANCELLED') {
      await restoreStock(myItems);
    }

    if (newStatus === 'DELIVERED') {
      for (const item of myItems) {
        await Plant.updateOne({ _id: item.plant }, { $inc: { totalSold: item.quantity } });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Order ${newStatus === 'CANCELLED' ? 'cancelled' : `marked ${newStatus}`}`,
      data: toSellerView(order, sellerId),
    });
  } catch (error) {
    if (error.name === 'VersionError') return conflictResponse(res);

    console.error('Update nursery seller status error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update order',
    });
  }
};

/*
|--------------------------------------------------------------------------
| REVIEW ORDER ITEM (BUYER)
|--------------------------------------------------------------------------
| POST /api/nursery/orders/:id/items/:itemId/review
|
| { "rating": 1-5, "comment": "..." }
|
| One review per delivered item. Updates the plant's rating.
|--------------------------------------------------------------------------
*/

export const reviewOrderItem = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return unauthorized(res);

    const { id, itemId } = req.params;

    if (!isValidId(id) || !isValidId(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order or item ID',
      });
    }

    const rating = Number(req.body?.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a whole number from 1 to 5',
      });
    }

    const order = await NurseryOrder.findOne({ _id: id, user: userId });
    const item = order?.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Order item not found',
      });
    }

    if (itemStatus(item, order) !== 'DELIVERED') {
      return res.status(400).json({
        success: false,
        message: 'You can review a plant only after it is delivered',
      });
    }

    const updated = await NurseryOrder.findOneAndUpdate(
      { _id: id, user: userId, items: { $elemMatch: { _id: itemId, 'review.rating': null } } },
      {
        $set: {
          'items.$.review.rating': rating,
          'items.$.review.comment': trimText(req.body?.comment),
          'items.$.review.createdAt': new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this plant',
      });
    }

    const [stats] = await NurseryOrder.aggregate([
      { $match: { 'items.plant': item.plant } },
      { $unwind: '$items' },
      { $match: { 'items.plant': item.plant, 'items.review.rating': { $ne: null } } },
      { $group: { _id: null, average: { $avg: '$items.review.rating' }, count: { $sum: 1 } } },
    ]);

    await Plant.updateOne(
      { _id: item.plant },
      {
        $set: {
          rating: stats ? Math.round(stats.average * 10) / 10 : 0,
          totalReviews: stats ? stats.count : 0,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Thank you for your review',
      data: await toBuyerView(updated),
    });
  } catch (error) {
    console.error('Review nursery order item error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to submit review',
    });
  }
};
