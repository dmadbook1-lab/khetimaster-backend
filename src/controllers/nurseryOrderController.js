import mongoose from 'mongoose';

import NurseryCart from '../models/NurseryCart.js';
import NurseryOrder from '../models/NurseryOrder.js';
import Plant from '../models/Plant.js';


// ======================================================
// GET AUTHENTICATED USER ID
// ======================================================

const getAuthenticatedUserId = req => {
  return (
    req.user?._id ||
    req.user?.id ||
    req.user?.userId ||
    req.user?.user?._id ||
    req.user?.user?.id ||
    null
  );
};


// ======================================================
// CREATE ORDER
// POST /api/nursery/orders
// ======================================================

export const createOrder = async (req, res) => {
  try {
    // ------------------------------------------
    // Validate authenticated user
    // ------------------------------------------

    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // ------------------------------------------
    // Validate delivery address
    // ------------------------------------------

    const {deliveryAddress} = req.body;

    if (!deliveryAddress) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address is required',
      });
    }

    const {
      fullName,
      phoneNumber,
      address,
      village,
      taluka,
      district,
      state,
      pincode,
    } = deliveryAddress;

    if (
      !fullName?.trim() ||
      !phoneNumber?.trim() ||
      !address?.trim() ||
      !pincode?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Full name, phone number, address and pincode are required',
      });
    }

    // ------------------------------------------
    // COD ONLY
    // ------------------------------------------

    const paymentMethod = 'COD';

    // ------------------------------------------
    // Get cart
    // ------------------------------------------

    const cart = await NurseryCart.findOne({
      user: userId,
    }).populate('items.plant');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty',
      });
    }

    // ------------------------------------------
    // Prepare order items
    // ------------------------------------------

    const orderItems = [];

    let subtotal = 0;

    // ------------------------------------------
    // Check stock + reduce stock
    // ------------------------------------------

    for (const cartItem of cart.items) {
      const plant = cartItem.plant;

      if (!plant) {
        return res.status(400).json({
          success: false,
          message:
            'One of the plants in your cart no longer exists',
        });
      }

      if (!plant.isActive) {
        return res.status(400).json({
          success: false,
          message:
            `${plant.name} is no longer available`,
        });
      }

      // ------------------------------------------
      // Validate seller
      // ------------------------------------------

      if (!plant.seller?.userId) {
        return res.status(400).json({
          success: false,
          message:
            `${plant.name} has invalid seller information`,
        });
      }

      const requestedQuantity =
        Number(cartItem.quantity);

      if (
        !Number.isInteger(requestedQuantity) ||
        requestedQuantity <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Invalid quantity for ${plant.name}`,
        });
      }

      // ------------------------------------------
      // Check current stock
      // ------------------------------------------

      if (
        Number(plant.quantity) <
        requestedQuantity
      ) {
        return res.status(400).json({
          success: false,
          message:
            `${plant.name} does not have enough stock`,
        });
      }

      // ------------------------------------------
      // Reduce stock
      //
      // IMPORTANT:
      // We use an atomic update so two users
      // cannot both successfully purchase stock
      // that is no longer available.
      // ------------------------------------------

      const updatedPlant =
        await Plant.findOneAndUpdate(
          {
            _id: plant._id,

            isActive: true,

            quantity: {
              $gte: requestedQuantity,
            },
          },
          {
            $inc: {
              quantity: -requestedQuantity,
            },
          },
          {
            new: true,
          },
        );

      if (!updatedPlant) {
        return res.status(400).json({
          success: false,
          message:
            `${plant.name} does not have enough stock`,
        });
      }

      // ------------------------------------------
      // Calculate item total
      // ------------------------------------------

      const price =
        Number(updatedPlant.price);

      const itemTotal =
        price * requestedQuantity;

      subtotal += itemTotal;

      // ------------------------------------------
      // Save order item snapshot
      // ------------------------------------------

      orderItems.push({
        plant: updatedPlant._id,

        name: updatedPlant.name,

        image:
          Array.isArray(updatedPlant.images) &&
          updatedPlant.images.length > 0
            ? updatedPlant.images[0]
            : '',

        seller: {
          userId:
            updatedPlant.seller.userId,

          name:
            updatedPlant.seller.name ||
            'Seller',
        },

        price,

        quantity: requestedQuantity,

        total: itemTotal,
      });
    }

    // ------------------------------------------
    // Delivery fee
    // ------------------------------------------

    const deliveryFee =
      subtotal >= 500 ? 0 : 50;

    const total =
      subtotal + deliveryFee;

    // ------------------------------------------
    // Create order
    // ------------------------------------------

    const order =
      await NurseryOrder.create({
        user: userId,

        items: orderItems,

        deliveryAddress: {
          fullName: fullName.trim(),

          phoneNumber:
            phoneNumber.trim(),

          address:
            address.trim(),

          village:
            village?.trim() || '',

          taluka:
            taluka?.trim() || '',

          district:
            district?.trim() || '',

          state:
            state?.trim() || '',

          pincode:
            pincode.trim(),
        },

        subtotal,

        deliveryFee,

        total,

        // COD ONLY
        paymentMethod: 'COD',

        paymentStatus: 'PENDING',

        orderStatus: 'PENDING',
      });

    // ------------------------------------------
    // Clear cart
    // ------------------------------------------

    cart.items = [];

    await cart.save();

    // ------------------------------------------
    // Success
    // ------------------------------------------

    return res.status(201).json({
      success: true,

      message:
        'Order placed successfully',

      data: order,
    });
  } catch (error) {
    console.error(
      'Create nursery order error:',
      error,
    );

    return res.status(400).json({
      success: false,

      message:
        error.message ||
        'Failed to place order',
    });
  }
};


// ======================================================
// GET MY ORDERS
// GET /api/nursery/orders
// ======================================================

export const getMyOrders = async (req, res) => {
  try {
    const userId =
      getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const orders =
      await NurseryOrder.find({
        user: userId,
      })
        .sort({
          createdAt: -1,
        })
        .lean();

    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error(
      'Get nursery orders error:',
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        'Failed to fetch orders',
    });
  }
};


// ======================================================
// GET SINGLE ORDER
// GET /api/nursery/orders/:id
// ======================================================

export const getOrderById = async (
  req,
  res,
) => {
  try {
    const userId =
      getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const {id} = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID',
      });
    }

    const order =
      await NurseryOrder.findOne({
        _id: id,
        user: userId,
      }).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error(
      'Get nursery order error:',
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        'Failed to fetch order',
    });
  }
};


// ======================================================
// CANCEL ORDER
// PUT /api/nursery/orders/:id/cancel
// ======================================================

export const cancelOrder = async (
  req,
  res,
) => {
  try {
    const userId =
      getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const {id} = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID',
      });
    }

    // ------------------------------------------
    // Find order
    // ------------------------------------------

    const order =
      await NurseryOrder.findOne({
        _id: id,
        user: userId,
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // ------------------------------------------
    // Validate cancellation
    // ------------------------------------------

    if (
      !['PENDING', 'CONFIRMED'].includes(
        order.orderStatus,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'This order can no longer be cancelled',
      });
    }

    // ------------------------------------------
    // Restore stock
    // ------------------------------------------

    for (const item of order.items) {
      if (!item.plant) {
        continue;
      }

      await Plant.findByIdAndUpdate(
        item.plant,
        {
          $inc: {
            quantity: item.quantity,
          },
        },
      );
    }

    // ------------------------------------------
    // Update order
    // ------------------------------------------

    order.orderStatus =
      'CANCELLED';

    await order.save();

    return res.status(200).json({
      success: true,

      message:
        'Order cancelled successfully',

      data: order,
    });
  } catch (error) {
    console.error(
      'Cancel nursery order error:',
      error,
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        'Failed to cancel order',
    });
  }
};