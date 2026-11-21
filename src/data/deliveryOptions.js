/*
|--------------------------------------------------------------------------
| DELIVERY OPTIONS
|--------------------------------------------------------------------------
|
| Values for the delivery partner and booking forms. The app reads them
| from GET /api/delivery/partners/meta instead of hardcoding them.
|
| Each vehicle type carries the default rates a new partner starts with
| (they can change them) and an average road speed used for the ETA.
|
*/

export const VEHICLE_TYPES = [
  {
    key: 'bike',
    label: 'Bike',
    capacityKg: 20,
    baseFare: 30,
    perKmRate: 8,
    minFare: 40,
    speedKmph: 30,
  },
  {
    key: 'auto',
    label: 'Auto / E-rickshaw',
    capacityKg: 300,
    baseFare: 60,
    perKmRate: 14,
    minFare: 80,
    speedKmph: 25,
  },
  {
    key: 'mini_truck',
    label: 'Mini truck',
    capacityKg: 750,
    baseFare: 200,
    perKmRate: 18,
    minFare: 300,
    speedKmph: 35,
  },
  {
    key: 'pickup',
    label: 'Pickup',
    capacityKg: 1500,
    baseFare: 250,
    perKmRate: 22,
    minFare: 350,
    speedKmph: 35,
  },
  {
    key: 'tractor_trolley',
    label: 'Tractor trolley',
    capacityKg: 3000,
    baseFare: 300,
    perKmRate: 25,
    minFare: 500,
    speedKmph: 20,
  },
  {
    key: 'truck',
    label: 'Truck',
    capacityKg: 9000,
    baseFare: 800,
    perKmRate: 40,
    minFare: 1500,
    speedKmph: 35,
  },
];

export const VEHICLE_KEYS = VEHICLE_TYPES.map((vehicle) => vehicle.key);

export const getVehicle = (key) =>
  VEHICLE_TYPES.find((vehicle) => vehicle.key === key) || VEHICLE_TYPES[0];

export const GOODS_TYPES = [
  'Grain / Produce',
  'Vegetables & Fruits',
  'Fertilizer & Seeds',
  'Pesticides',
  'Farm tools',
  'Fodder',
  'Milk / Dairy',
  'Household goods',
  'Other',
];

export const PAYMENT_METHODS = ['cod', 'upi'];

export const SCHEDULE_TYPES = ['now', 'scheduled'];

/*
 * Time the driver needs to reach the pickup, and to load + unload,
 * added on top of the driving time.
 */
export const REACH_PICKUP_MINUTES = 15;
export const LOADING_MINUTES = 20;

/*
 * Straight-line distance between two points is multiplied by this to
 * approximate the road distance.
 */
export const ROAD_FACTOR = 1.25;

export const MIN_DISTANCE_KM = 0.5;
export const MAX_DISTANCE_KM = 1500;

// A "book now" request the driver hasn't answered in this time expires.
export const NOW_REQUEST_TIMEOUT_MINUTES = 10;

// Scheduled pickups: at least this far ahead, at most MAX_SCHEDULE_DAYS.
export const MIN_SCHEDULE_LEAD_MINUTES = 30;
export const MAX_SCHEDULE_DAYS = 30;
