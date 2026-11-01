/*
|--------------------------------------------------------------------------
| APP SCREENS AI GURU CAN OPEN
|--------------------------------------------------------------------------
|
| Keys are shared with the mobile app (src/constants/aiGuruScreens.js),
| which maps each key to its navigation route. `param` is the id the
| screen needs, when it shows one record.
|
*/

export const APP_SCREENS = {
  home: { description: 'Home dashboard' },
  my_farms: { description: 'List of the farmer’s mapped farms' },
  add_farm: { description: 'Map / add a new farm boundary' },
  farm_overview: {
    description: 'One farm with satellite crop health and smart advisory',
    param: 'fieldId',
  },
  weather: { description: 'Local weather and 7-day forecast' },
  mandi: { description: 'Mandi (market) prices for all crops' },
  mandi_crop: {
    description: 'Mandi prices of one crop (param cropName, e.g. "Onion")',
    param: 'cropName',
  },
  labour: { description: 'Find and hire farm labour' },
  labourer_details: { description: 'One labourer’s profile to book', param: 'labourerId' },
  my_labour_bookings: { description: 'Labour bookings the farmer made' },
  machinery: { description: 'Rent tractors and farm machinery' },
  machinery_details: { description: 'One machine to rent', param: 'machineryId' },
  my_machinery_bookings: { description: 'Machinery bookings the farmer made' },
  doctors: { description: 'Agricultural and veterinary doctors to consult' },
  doctor_details: { description: 'One doctor’s profile to book', param: 'doctorId' },
  my_consultations: { description: 'Doctor consultations the farmer booked' },
  nursery: { description: 'Plant nursery shop (saplings, seedlings, plants)' },
  nursery_plant: { description: 'One nursery plant to buy', param: 'plantId' },
  nursery_orders: { description: 'Nursery orders the farmer placed' },
  market: { description: 'Marketplace to buy produce, equipment and farm inputs' },
  market_listing: { description: 'One marketplace listing', param: 'listingId' },
  market_sell: { description: 'Create a listing to sell produce / equipment / inputs' },
  market_deals: { description: 'The farmer’s marketplace offers and deals' },
  disease_detection: { description: 'Detect crop disease from a photo' },
  news: { description: 'Agriculture news and articles' },
  gov_schemes: { description: 'Government schemes for farmers' },
  drone: { description: 'Book drone spraying services' },
  agri_products: { description: 'Shop for seeds, fertilizers and crop protection' },
  community: { description: 'Farmer community: questions, experts, videos' },
  profile: { description: 'The farmer’s profile and settings' },
};

export const APP_SCREEN_KEYS = Object.keys(APP_SCREENS);
