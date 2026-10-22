/*
|--------------------------------------------------------------------------
| LABOUR OPTIONS
|--------------------------------------------------------------------------
|
| Values for the labour profile and booking forms. The app should use
| GET /api/labourers/meta instead of hardcoding these.
|
| labourType and workType are free text (older profiles may contain any
| value); LABOUR_TYPES and WORK_TYPES are suggestions for the dropdowns.
|
*/

export const LABOUR_TYPES = [
  'General Farm Labour',
  'Harvesting',
  'Sowing & Planting',
  'Weeding',
  'Spraying',
  'Irrigation',
  'Tractor Driver',
  'Machine Operator',
  'Fruit Picking',
  'Dairy & Cattle Care',
  'Loading & Unloading',
  'Pruning & Grafting',
];

export const WORK_TYPES = [
  'Harvesting',
  'Sowing',
  'Transplanting',
  'Weeding',
  'Spraying',
  'Fertilizer application',
  'Irrigation',
  'Land preparation',
  'Fruit picking',
  'Loading / unloading',
  'Cattle care',
  'Other',
];

export const LANGUAGES = [
  'Marathi',
  'Hindi',
  'English',
  'Gujarati',
  'Kannada',
  'Telugu',
  'Punjabi',
];

export const GENDERS = ['male', 'female', 'other'];

export const WAGE_TYPES = ['daily', 'hourly', 'monthly'];

export const EXPERIENCE_UNITS = ['years', 'months'];

export const AVAILABILITY_OPTIONS = ['available', 'unavailable', 'busy'];

export const MAX_BOOKING_DAYS = 90;
