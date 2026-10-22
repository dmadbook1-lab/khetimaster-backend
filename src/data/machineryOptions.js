/*
|--------------------------------------------------------------------------
| MACHINERY OPTIONS
|--------------------------------------------------------------------------
|
| Values for the machinery rental forms. The app should use
| GET /api/machinery/meta instead of hardcoding these.
|
| category and implements are free text (older listings may contain any
| value); MACHINERY_CATEGORIES and IMPLEMENTS are suggestions.
|
*/

export const MACHINERY_CATEGORIES = [
  'Tractor',
  'Rotavator',
  'Cultivator',
  'Plough',
  'Harrow',
  'Seed Drill',
  'Planter',
  'Transplanter',
  'Combine Harvester',
  'Reaper',
  'Thresher',
  'Baler',
  'Sprayer',
  'Power Tiller',
  'Tractor Trolley',
  'Water Tanker',
  'JCB / Excavator',
  'Other',
];

export const IMPLEMENTS = [
  'Rotavator',
  'Cultivator',
  'MB Plough',
  'Disc Plough',
  'Disc Harrow',
  'Seed Drill',
  'Ridger',
  'Leveller',
  'Trolley',
  'Sprayer',
  'Thresher',
];

export const FUEL_TYPES = ['petrol', 'diesel', 'electric', 'other'];

export const DRIVE_TYPES = ['2WD', '4WD', 'AWD', 'other'];

export const ENGINE_POWER_UNITS = ['HP', 'kW', 'CC'];

export const AVAILABILITY_OPTIONS = ['available', 'unavailable', 'busy'];

export const PRICING_TYPES = ['hourly', 'daily', 'custom'];

/*
 * Units for an owner's custom rates, e.g. "Rotavator - ₹1200 per acre".
 */
export const CUSTOM_PRICE_UNITS = ['hour', 'day', 'job', 'acre', 'custom'];

export const PAYMENT_METHODS = ['cod', 'upi', 'card', 'wallet'];

export const MAX_BOOKING_DAYS = 30;

export const MAX_BOOKING_HOURS = 24;
