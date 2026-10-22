import mongoose from 'mongoose';

import NurseryCart from '../models/NurseryCart.js';
import Plant from '../models/Plant.js';

import { MAX_CART_ITEMS, calculateDeliveryFee } from '../data/nurseryOptions.js';

const PLANT_FIELDS = 'name category description images price quantity seller location isActive';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getValidUserId = (req) => {
  const userId = req.user?.userId;
  return userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null;
};

const unauthorized = (res) =>
  res.status(401).json({
    success: false,
    message: 'Authenticated user not found',
  });

/*
 * Get the user's cart, creating an empty one if needed.
 */
const getOrCreateCart = async (userId) => {
  try {
    return await NurseryCart.findOneAndUpdate(
      { user: userId },
      { $setOnInsert: { user: userId, items: [] } },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (error) {
    // Two requests created the cart at the same moment; it exists now.
    if (error.code === 11000) return NurseryCart.findOne({ user: userId });
    throw error;
  }
};

/*
 * Converts the cart into the structure used by the app.
 *
 * Items whose plant was removed or sold out are listed under
 * unavailableItems instead of being silently dropped. Items with more
 * quantity than is now in stock are capped and flagged.
 */
const formatCart = async (cart) => {
  if (!cart || cart.items.length === 0) {
    return {
      items: [],
      unavailableItems: [],
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
      totalItems: 0,
    };
  }

  await cart.populate({ path: 'items.plant', select: PLANT_FIELDS });

  let subtotal = 0;
  let totalItems = 0;

  const items = [];
  const unavailableItems = [];

  for (const item of cart.items) {
    const plant = item.plant;

    if (!plant || !plant.isActive || plant.quantity <= 0) {
      unavailableItems.push({
        _id: item._id,
        name: plant?.name || 'Plant',
        reason: !plant || !plant.isActive ? 'No longer available' : 'Out of stock',
      });
      continue;
    }

    const quantity = Math.min(item.quantity, plant.quantity);
    const itemTotal = Number(plant.price) * quantity;

    subtotal += itemTotal;
    totalItems += quantity;

    items.push({
      _id: item._id,
      quantity,
      plant,
      itemTotal,
      quantityAdjusted: quantity !== item.quantity,
    });
  }

  const deliveryFee = items.length > 0 ? calculateDeliveryFee(subtotal) : 0;

  return {
    items,
    unavailableItems,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    totalItems,
  };
};

/*
|--------------------------------------------------------------------------
| GET CART
|--------------------------------------------------------------------------
| GET /api/nursery/cart
|--------------------------------------------------------------------------
*/

export const getCart = async (req, res) => {
  try {
    const userId = getValidUserId(req);
    if (!userId) return unauthorized(res);

    const cart = await NurseryCart.findOne({ user: userId });

    return res.status(200).json({
      success: true,
      data: await formatCart(cart),
    });
  } catch (error) {
    console.error('Get nursery cart error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch cart',
    });
  }
};

/*
|--------------------------------------------------------------------------
| ADD TO CART
|--------------------------------------------------------------------------
| POST /api/nursery/cart
|
| { "plantId": "...", "quantity": 1 }
|--------------------------------------------------------------------------
*/

export const addToCart = async (req, res) => {
  try {
    const userId = getValidUserId(req);
    if (!userId) return unauthorized(res);

    const { plantId, quantity = 1 } = req.body;

    if (!plantId || !mongoose.Types.ObjectId.isValid(plantId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid plant ID is required',
      });
    }

    const requestedQuantity = Number(quantity);

    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1',
      });
    }

    const plant = await Plant.findOne({ _id: plantId, isActive: true });

    if (!plant) {
      return res.status(404).json({
        success: false,
        message: 'Plant not found',
      });
    }

    if (String(plant.seller?.userId) === String(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot buy your own plant',
      });
    }

    if (plant.quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Plant is currently out of stock',
      });
    }

    const cart = await getOrCreateCart(userId);

    const existingItem = cart.items.find(
      (item) => item.plant && String(item.plant) === String(plant._id)
    );

    const newQuantity = (existingItem?.quantity || 0) + requestedQuantity;

    if (newQuantity > plant.quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${plant.quantity} plants are available`,
      });
    }

    if (existingItem) {
      existingItem.quantity = newQuantity;
    } else {
      if (cart.items.length >= MAX_CART_ITEMS) {
        return res.status(400).json({
          success: false,
          message: `Your cart can hold at most ${MAX_CART_ITEMS} different plants`,
        });
      }

      cart.items.push({ plant: plant._id, quantity: requestedQuantity });
    }

    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Plant added to cart',
      data: await formatCart(cart),
    });
  } catch (error) {
    console.error('Add to nursery cart error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to add plant to cart',
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE CART ITEM
|--------------------------------------------------------------------------
| PUT /api/nursery/cart/:itemId
|
| { "quantity": 3 }
|--------------------------------------------------------------------------
*/

export const updateCartItem = async (req, res) => {
  try {
    const userId = getValidUserId(req);
    if (!userId) return unauthorized(res);

    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cart item ID',
      });
    }

    const newQuantity = Number(req.body?.quantity);

    if (!Number.isInteger(newQuantity) || newQuantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1',
      });
    }

    const cart = await NurseryCart.findOne({ user: userId });
    const item = cart?.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found',
      });
    }

    const plant = await Plant.findById(item.plant);

    if (!plant || !plant.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Plant is no longer available',
      });
    }

    if (plant.quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Plant is currently out of stock',
      });
    }

    if (newQuantity > plant.quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${plant.quantity} plants are available`,
      });
    }

    item.quantity = newQuantity;

    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Cart updated successfully',
      data: await formatCart(cart),
    });
  } catch (error) {
    console.error('Update nursery cart error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update cart',
    });
  }
};

/*
|--------------------------------------------------------------------------
| REMOVE CART ITEM
|--------------------------------------------------------------------------
| DELETE /api/nursery/cart/:itemId
|--------------------------------------------------------------------------
*/

export const removeFromCart = async (req, res) => {
  try {
    const userId = getValidUserId(req);
    if (!userId) return unauthorized(res);

    const { itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cart item ID',
      });
    }

    const cart = await NurseryCart.findOneAndUpdate(
      { user: userId, 'items._id': itemId },
      { $pull: { items: { _id: itemId } } },
      { returnDocument: 'after' }
    );

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: await formatCart(cart),
    });
  } catch (error) {
    console.error('Remove nursery cart item error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to remove cart item',
    });
  }
};

/*
|--------------------------------------------------------------------------
| CLEAR CART
|--------------------------------------------------------------------------
| DELETE /api/nursery/cart
|--------------------------------------------------------------------------
*/

export const clearCart = async (req, res) => {
  try {
    const userId = getValidUserId(req);
    if (!userId) return unauthorized(res);

    await NurseryCart.updateOne({ user: userId }, { $set: { items: [] } });

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: await formatCart(null),
    });
  } catch (error) {
    console.error('Clear nursery cart error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
    });
  }
};
