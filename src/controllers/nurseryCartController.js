import mongoose from 'mongoose';

import NurseryCart from '../models/NurseryCart.js';
import Plant from '../models/Plant.js';

/*
|--------------------------------------------------------------------------
| HELPER — GET AUTHENTICATED USER ID
|--------------------------------------------------------------------------
|
| Depending on your auth middleware, the user ID may be stored as:
|
| req.user._id
| req.user.id
| req.user.userId
| req.user.sub
|
*/

const getAuthenticatedUserId = req => {
  if (!req.user) {
    return null;
  }

  return (
    req.user._id ||
    req.user.id ||
    req.user.userId ||
    req.user.sub ||
    null
  );
};

/*
|--------------------------------------------------------------------------
| HELPER — VALIDATE USER ID
|--------------------------------------------------------------------------
*/

const getValidUserId = req => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  return userId;
};

/*
|--------------------------------------------------------------------------
| HELPER — POPULATE CART
|--------------------------------------------------------------------------
*/

const populateCart = async cart => {
  if (!cart) {
    return null;
  }

  await cart.populate({
    path: 'items.plant',
    select:
      'name category description images price quantity seller location isActive',
  });

  return cart;
};

/*
|--------------------------------------------------------------------------
| HELPER — FORMAT CART
|--------------------------------------------------------------------------
|
| Converts the MongoDB cart into the structure used by the frontend.
|
*/

const formatCart = cart => {
  if (!cart) {
    return {
      items: [],
      subtotal: 0,
      totalItems: 0,
    };
  }

  let subtotal = 0;
  let totalItems = 0;

  const items = [];

  for (const item of cart.items) {
    const plant = item.plant;

    /*
    |--------------------------------------------------------------------------
    | Ignore deleted / unavailable plants
    |--------------------------------------------------------------------------
    */

    if (
      !plant ||
      !plant.isActive ||
      plant.quantity <= 0
    ) {
      continue;
    }

    /*
    |--------------------------------------------------------------------------
    | Never allow cart quantity to exceed current stock
    |--------------------------------------------------------------------------
    */

    const quantity = Math.min(
      item.quantity,
      plant.quantity,
    );

    if (quantity <= 0) {
      continue;
    }

    const itemTotal =
      Number(plant.price) * quantity;

    subtotal += itemTotal;
    totalItems += quantity;

    items.push({
      _id: item._id,
      quantity,
      plant,
      itemTotal,
    });
  }

  return {
    items,
    subtotal,
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
    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */

    const userId = getValidUserId(req);

    if (!userId) {
      console.error(
        'Get nursery cart: invalid authenticated user',
        req.user,
      );

      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find cart
    |--------------------------------------------------------------------------
    */

    const cart = await NurseryCart.findOne({
      user: userId,
    });

    /*
    |--------------------------------------------------------------------------
    | No cart yet
    |--------------------------------------------------------------------------
    */

    if (!cart) {
      return res.status(200).json({
        success: true,
        data: {
          items: [],
          subtotal: 0,
          totalItems: 0,
        },
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Populate plants
    |--------------------------------------------------------------------------
    */

    await populateCart(cart);

    /*
    |--------------------------------------------------------------------------
    | Format response
    |--------------------------------------------------------------------------
    */

    const formattedCart = formatCart(cart);

    return res.status(200).json({
      success: true,
      data: formattedCart,
    });
  } catch (error) {
    console.error(
      'Get nursery cart error:',
      error,
    );

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
|--------------------------------------------------------------------------
|
| Body:
|
| {
|   "plantId": "...",
|   "quantity": 1
| }
|
*/

export const addToCart = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */

    const userId = getValidUserId(req);

    if (!userId) {
      console.error(
        'Add to nursery cart: invalid authenticated user',
        req.user,
      );

      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Request body
    |--------------------------------------------------------------------------
    */

    const {
      plantId,
      quantity = 1,
    } = req.body;

    if (!plantId) {
      return res.status(400).json({
        success: false,
        message: 'Plant ID is required',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Validate plant ID
    |--------------------------------------------------------------------------
    */

    if (!mongoose.Types.ObjectId.isValid(plantId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plant ID',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Validate quantity
    |--------------------------------------------------------------------------
    */

    const requestedQuantity = Number(quantity);

    if (
      !Number.isInteger(requestedQuantity) ||
      requestedQuantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find plant
    |--------------------------------------------------------------------------
    */

    const plant = await Plant.findOne({
      _id: plantId,
      isActive: true,
    });

    if (!plant) {
      return res.status(404).json({
        success: false,
        message: 'Plant not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Stock validation
    |--------------------------------------------------------------------------
    */

    if (plant.quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Plant is currently out of stock',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find user's cart
    |--------------------------------------------------------------------------
    */

    let cart = await NurseryCart.findOne({
      user: userId,
    });

    /*
    |--------------------------------------------------------------------------
    | Create cart if it doesn't exist
    |--------------------------------------------------------------------------
    */

    if (!cart) {
      cart = new NurseryCart({
        user: userId,
        items: [],
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Check existing item
    |--------------------------------------------------------------------------
    */

    const existingItem = cart.items.find(
      item =>
        item.plant &&
        item.plant.toString() ===
          plant._id.toString(),
    );

    if (existingItem) {
      const newQuantity =
        existingItem.quantity +
        requestedQuantity;

      if (newQuantity > plant.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${plant.quantity} plants are available`,
        });
      }

      existingItem.quantity = newQuantity;
    } else {
      if (
        requestedQuantity >
        plant.quantity
      ) {
        return res.status(400).json({
          success: false,
          message: `Only ${plant.quantity} plants are available`,
        });
      }

      cart.items.push({
        plant: plant._id,
        quantity: requestedQuantity,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Save
    |--------------------------------------------------------------------------
    */

    await cart.save();

    /*
    |--------------------------------------------------------------------------
    | Populate updated cart
    |--------------------------------------------------------------------------
    */

    await populateCart(cart);

    const formattedCart = formatCart(cart);

    return res.status(200).json({
      success: true,
      message: 'Plant added to cart',
      data: formattedCart,
    });
  } catch (error) {
    console.error(
      'Add to nursery cart error:',
      error,
    );

    /*
    |--------------------------------------------------------------------------
    | Duplicate cart protection
    |--------------------------------------------------------------------------
    */

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          'Cart already exists. Please try again.',
      });
    }

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
|--------------------------------------------------------------------------
|
| Body:
|
| {
|   "quantity": 3
| }
|
*/

export const updateCartItem = async (
  req,
  res,
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */

    const userId = getValidUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Params
    |--------------------------------------------------------------------------
    */

    const {itemId} = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        itemId,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cart item ID',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Quantity
    |--------------------------------------------------------------------------
    */

    const {quantity} = req.body;

    const newQuantity = Number(quantity);

    if (
      !Number.isInteger(newQuantity) ||
      newQuantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be at least 1',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find cart
    |--------------------------------------------------------------------------
    */

    const cart = await NurseryCart.findOne({
      user: userId,
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find item
    |--------------------------------------------------------------------------
    */

    const item = cart.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find plant
    |--------------------------------------------------------------------------
    */

    const plant = await Plant.findById(
      item.plant,
    );

    if (
      !plant ||
      !plant.isActive
    ) {
      return res.status(404).json({
        success: false,
        message:
          'Plant is no longer available',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Stock validation
    |--------------------------------------------------------------------------
    */

    if (plant.quantity <= 0) {
      return res.status(400).json({
        success: false,
        message:
          'Plant is currently out of stock',
      });
    }

    if (
      newQuantity >
      plant.quantity
    ) {
      return res.status(400).json({
        success: false,
        message: `Only ${plant.quantity} plants are available`,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Update
    |--------------------------------------------------------------------------
    */

    item.quantity = newQuantity;

    await cart.save();

    /*
    |--------------------------------------------------------------------------
    | Populate
    |--------------------------------------------------------------------------
    */

    await populateCart(cart);

    const formattedCart = formatCart(cart);

    return res.status(200).json({
      success: true,
      message: 'Cart updated successfully',
      data: formattedCart,
    });
  } catch (error) {
    console.error(
      'Update nursery cart error:',
      error,
    );

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

export const removeFromCart = async (
  req,
  res,
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */

    const userId = getValidUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Item ID
    |--------------------------------------------------------------------------
    */

    const {itemId} = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        itemId,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cart item ID',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find cart
    |--------------------------------------------------------------------------
    */

    const cart = await NurseryCart.findOne({
      user: userId,
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find item
    |--------------------------------------------------------------------------
    */

    const item = cart.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Remove item
    |--------------------------------------------------------------------------
    */

    item.deleteOne();

    await cart.save();

    /*
    |--------------------------------------------------------------------------
    | Return updated cart
    |--------------------------------------------------------------------------
    */

    await populateCart(cart);

    const formattedCart = formatCart(cart);

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: formattedCart,
    });
  } catch (error) {
    console.error(
      'Remove nursery cart item error:',
      error,
    );

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

export const clearCart = async (
  req,
  res,
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */

    const userId = getValidUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Clear items
    |--------------------------------------------------------------------------
    */

    await NurseryCart.findOneAndUpdate(
      {
        user: userId,
      },
      {
        $set: {
          items: [],
        },
      },
    );

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: {
        items: [],
        subtotal: 0,
        totalItems: 0,
      },
    });
  } catch (error) {
    console.error(
      'Clear nursery cart error:',
      error,
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to clear cart',
    });
  }
};