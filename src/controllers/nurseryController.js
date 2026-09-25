import mongoose from 'mongoose';

import Plant from '../models/Plant.js';
import User from '../models/User.js';

/*
|--------------------------------------------------------------------------
| HELPER — GET AUTHENTICATED USER ID
|--------------------------------------------------------------------------
|
| Different auth middleware implementations may store the authenticated
| user's ID as:
|
| req.user._id
| req.user.id
| req.user.userId
| req.user.sub
|
| This helper handles all common cases.
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
| HELPER — VALIDATE AUTHENTICATED USER
|--------------------------------------------------------------------------
*/

const requireAuthenticatedUser = req => {
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return {
      valid: false,
      userId: null,
    };
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return {
      valid: false,
      userId: null,
    };
  }

  return {
    valid: true,
    userId,
  };
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
| ?search=mango
| ?state=Maharashtra
| ?district=Pune
| ?minPrice=20
| ?maxPrice=500
| ?page=1
| ?limit=20
|
*/

export const getPlants = async (req, res) => {
  try {
    const {
      category,
      search,
      state,
      district,
      minPrice,
      maxPrice,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {
      isActive: true,
      quantity: {
        $gt: 0,
      },
    };

    /*
    |--------------------------------------------------------------------------
    | Category
    |--------------------------------------------------------------------------
    */

    if (category?.trim()) {
      filter.category = category.trim();
    }

    /*
    |--------------------------------------------------------------------------
    | State
    |--------------------------------------------------------------------------
    */

    if (state?.trim()) {
      filter['location.state'] = state.trim();
    }

    /*
    |--------------------------------------------------------------------------
    | District
    |--------------------------------------------------------------------------
    */

    if (district?.trim()) {
      filter['location.district'] = district.trim();
    }

    /*
    |--------------------------------------------------------------------------
    | Search
    |--------------------------------------------------------------------------
    */

    if (search?.trim()) {
      filter.$text = {
        $search: search.trim(),
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Price range
    |--------------------------------------------------------------------------
    */

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};

      if (minPrice !== undefined && minPrice !== '') {
        const minimumPrice = Number(minPrice);

        if (!Number.isNaN(minimumPrice)) {
          filter.price.$gte = minimumPrice;
        }
      }

      if (maxPrice !== undefined && maxPrice !== '') {
        const maximumPrice = Number(maxPrice);

        if (!Number.isNaN(maximumPrice)) {
          filter.price.$lte = maximumPrice;
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Pagination
    |--------------------------------------------------------------------------
    */

    const currentPage = Math.max(Number(page) || 1, 1);

    const itemsPerPage = Math.min(
      Math.max(Number(limit) || 20, 1),
      50,
    );

    const skip = (currentPage - 1) * itemsPerPage;

    /*
    |--------------------------------------------------------------------------
    | Fetch plants
    |--------------------------------------------------------------------------
    */

    const [plants, total] = await Promise.all([
      Plant.find(filter)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
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
        totalPages:
          total === 0
            ? 0
            : Math.ceil(total / itemsPerPage),
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
|--------------------------------------------------------------------------
*/

export const getPlantById = async (req, res) => {
  try {
    const {id} = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plant ID',
      });
    }

    const plant = await Plant.findOne({
      _id: id,
      isActive: true,
    }).lean();

    if (!plant) {
      return res.status(404).json({
        success: false,
        message: 'Plant not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: plant,
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
|--------------------------------------------------------------------------
*/

export const getCategories = async (req, res) => {
  try {
    const categories = await Plant.distinct('category', {
      isActive: true,
    });

    const sortedCategories = categories
      .filter(Boolean)
      .sort((a, b) =>
        a.localeCompare(b),
      );

    return res.status(200).json({
      success: true,
      data: sortedCategories,
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
| User can list their own plant.
|--------------------------------------------------------------------------
*/

export const createPlant = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */

    const auth = requireAuthenticatedUser(req);

    if (!auth.valid) {
      console.error(
        'Create plant: unable to determine authenticated user',
        req.user,
      );

      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const {userId} = auth;

    /*
    |--------------------------------------------------------------------------
    | Request body
    |--------------------------------------------------------------------------
    */

    const {
      name,
      category,
      description = '',
      images = [],
      price,
      quantity,
      state = '',
      district = '',
    } = req.body;

    /*
    |--------------------------------------------------------------------------
    | Required fields
    |--------------------------------------------------------------------------
    */

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Plant name is required',
      });
    }

    if (!category?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Plant category is required',
      });
    }

    if (
      price === undefined ||
      price === null ||
      price === ''
    ) {
      return res.status(400).json({
        success: false,
        message: 'Plant price is required',
      });
    }

    if (
      quantity === undefined ||
      quantity === null ||
      quantity === ''
    ) {
      return res.status(400).json({
        success: false,
        message: 'Plant quantity is required',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Number validation
    |--------------------------------------------------------------------------
    */

    const plantPrice = Number(price);
    const plantQuantity = Number(quantity);

    if (
      !Number.isFinite(plantPrice) ||
      plantPrice < 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plant price',
      });
    }

    if (
      !Number.isFinite(plantQuantity) ||
      plantQuantity < 0 ||
      !Number.isInteger(plantQuantity)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a valid whole number',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Find authenticated user
    |--------------------------------------------------------------------------
    |
    | This is important.
    |
    | We don't blindly trust req.user._id.
    | We resolve the actual MongoDB user document.
    |
    */

    const user = await User.findById(userId).select(
      '_id fullName name firstName lastName email',
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Seller name
    |--------------------------------------------------------------------------
    */

    const sellerName =
      user.fullName ||
      user.name ||
      [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ') ||
      user.email ||
      'KhetiMaster User';

    /*
    |--------------------------------------------------------------------------
    | Images
    |--------------------------------------------------------------------------
    */

    const plantImages = Array.isArray(images)
      ? images.filter(
          image =>
            typeof image === 'string' &&
            image.trim().length > 0,
        )
      : [];

    /*
    |--------------------------------------------------------------------------
    | Create listing
    |--------------------------------------------------------------------------
    */

    const plant = await Plant.create({
      name: name.trim(),

      category: category.trim(),

      description:
        typeof description === 'string'
          ? description.trim()
          : '',

      images: plantImages,

      price: plantPrice,

      quantity: plantQuantity,

      seller: {
        userId: user._id,
        name: sellerName,
      },

      location: {
        state:
          typeof state === 'string'
            ? state.trim()
            : '',

        district:
          typeof district === 'string'
            ? district.trim()
            : '',
      },

      isActive: true,
    });

    /*
    |--------------------------------------------------------------------------
    | Success
    |--------------------------------------------------------------------------
    */

    return res.status(201).json({
      success: true,
      message: 'Plant listed successfully',
      data: plant,
    });
  } catch (error) {
    console.error(
      'Create plant listing error:',
      error,
    );

    /*
    |--------------------------------------------------------------------------
    | Mongoose validation error
    |--------------------------------------------------------------------------
    */

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Plant validation failed',
        errors: Object.values(error.errors).map(
          validationError => validationError.message,
        ),
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Generic error
    |--------------------------------------------------------------------------
    */

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
|--------------------------------------------------------------------------
*/

export const getMyListings = async (req, res) => {
  try {
    const auth = requireAuthenticatedUser(req);

    if (!auth.valid) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const {userId} = auth;

    const plants = await Plant.find({
      'seller.userId': userId,
    })
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      data: plants,
    });
  } catch (error) {
    console.error(
      'Get my nursery listings error:',
      error,
    );

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
|--------------------------------------------------------------------------
*/

export const updatePlant = async (req, res) => {
  try {
    const {id} = req.params;

    /*
    |--------------------------------------------------------------------------
    | Validate plant ID
    |--------------------------------------------------------------------------
    */

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plant ID',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */

    const auth = requireAuthenticatedUser(req);

    if (!auth.valid) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const {userId} = auth;

    /*
    |--------------------------------------------------------------------------
    | Find user's listing
    |--------------------------------------------------------------------------
    */

    const plant = await Plant.findOne({
      _id: id,
      'seller.userId': userId,
    });

    if (!plant) {
      return res.status(404).json({
        success: false,
        message: 'Plant listing not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Request body
    |--------------------------------------------------------------------------
    */

    const {
      name,
      category,
      description,
      images,
      price,
      quantity,
      state,
      district,
      isActive,
    } = req.body;

    /*
    |--------------------------------------------------------------------------
    | Name
    |--------------------------------------------------------------------------
    */

    if (name !== undefined) {
      if (
        typeof name !== 'string' ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Plant name cannot be empty',
        });
      }

      plant.name = name.trim();
    }

    /*
    |--------------------------------------------------------------------------
    | Category
    |--------------------------------------------------------------------------
    */

    if (category !== undefined) {
      if (
        typeof category !== 'string' ||
        !category.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Plant category cannot be empty',
        });
      }

      plant.category = category.trim();
    }

    /*
    |--------------------------------------------------------------------------
    | Description
    |--------------------------------------------------------------------------
    */

    if (description !== undefined) {
      plant.description =
        typeof description === 'string'
          ? description.trim()
          : '';
    }

    /*
    |--------------------------------------------------------------------------
    | Images
    |--------------------------------------------------------------------------
    */

    if (images !== undefined) {
      plant.images = Array.isArray(images)
        ? images.filter(
            image =>
              typeof image === 'string' &&
              image.trim().length > 0,
          )
        : [];
    }

    /*
    |--------------------------------------------------------------------------
    | Price
    |--------------------------------------------------------------------------
    */

    if (price !== undefined) {
      const newPrice = Number(price);

      if (
        !Number.isFinite(newPrice) ||
        newPrice < 0
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid price',
        });
      }

      plant.price = newPrice;
    }

    /*
    |--------------------------------------------------------------------------
    | Quantity
    |--------------------------------------------------------------------------
    */

    if (quantity !== undefined) {
      const newQuantity = Number(quantity);

      if (
        !Number.isInteger(newQuantity) ||
        newQuantity < 0
      ) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be a valid whole number',
        });
      }

      plant.quantity = newQuantity;
    }

    /*
    |--------------------------------------------------------------------------
    | Location
    |--------------------------------------------------------------------------
    */

    if (state !== undefined) {
      plant.location.state =
        typeof state === 'string'
          ? state.trim()
          : '';
    }

    if (district !== undefined) {
      plant.location.district =
        typeof district === 'string'
          ? district.trim()
          : '';
    }

    /*
    |--------------------------------------------------------------------------
    | Active status
    |--------------------------------------------------------------------------
    */

    if (isActive !== undefined) {
      plant.isActive = Boolean(isActive);
    }

    /*
    |--------------------------------------------------------------------------
    | Save
    |--------------------------------------------------------------------------
    */

    await plant.save();

    return res.status(200).json({
      success: true,
      message: 'Plant listing updated successfully',
      data: plant,
    });
  } catch (error) {
    console.error(
      'Update plant listing error:',
      error,
    );

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Plant validation failed',
        errors: Object.values(error.errors).map(
          validationError => validationError.message,
        ),
      });
    }

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
|--------------------------------------------------------------------------
|
| We use a soft delete instead of permanently deleting
| the document.
|
*/

export const deletePlant = async (req, res) => {
  try {
    const {id} = req.params;

    /*
    |--------------------------------------------------------------------------
    | Validate ID
    |--------------------------------------------------------------------------
    */

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plant ID',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */

    const auth = requireAuthenticatedUser(req);

    if (!auth.valid) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user not found',
      });
    }

    const {userId} = auth;

    /*
    |--------------------------------------------------------------------------
    | Find listing owned by user
    |--------------------------------------------------------------------------
    */

    const plant = await Plant.findOne({
      _id: id,
      'seller.userId': userId,
    });

    if (!plant) {
      return res.status(404).json({
        success: false,
        message: 'Plant listing not found',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Soft delete
    |--------------------------------------------------------------------------
    */

    plant.isActive = false;

    await plant.save();

    return res.status(200).json({
      success: true,
      message: 'Plant listing removed successfully',
    });
  } catch (error) {
    console.error(
      'Delete plant listing error:',
      error,
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to remove plant listing',
    });
  }
};