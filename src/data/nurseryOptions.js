/*
|--------------------------------------------------------------------------
| NURSERY OPTIONS
|--------------------------------------------------------------------------
|
| Values for the nursery forms. The app should use GET /api/nursery/meta
| instead of hardcoding these.
|
| category is free text (older listings may contain any value);
| PLANT_CATEGORIES are suggestions for the create form.
|
*/

export const PLANT_CATEGORIES = [
  'Fruit Plants',
  'Vegetable Seedlings',
  'Flowering Plants',
  'Medicinal Plants',
  'Timber Trees',
  'Plantation Crops',
  'Spice Plants',
  'Ornamental Plants',
  'Indoor Plants',
  'Grafted Saplings',
  'Seeds',
  'Other',
];

/*
 * Order progression. Each seller moves their items forward through
 * these; an item can also be CANCELLED while PENDING or CONFIRMED.
 */
export const ORDER_FLOW = ['PENDING', 'CONFIRMED', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

export const CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED'];

export const FREE_DELIVERY_THRESHOLD = 500;

export const DELIVERY_FEE = 50;

export const MAX_CART_ITEMS = 50;

export const MAX_IMAGES = 10;

export const calculateDeliveryFee = (subtotal) =>
  subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
