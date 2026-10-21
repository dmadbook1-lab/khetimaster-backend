/*
|--------------------------------------------------------------------------
| MARKETPLACE CATEGORIES
|--------------------------------------------------------------------------
|
| Every listing belongs to one category. The category decides the
| listing "kind":
|
|   PRODUCE   -> crops, fruits, vegetables etc. sold by quantity
|   EQUIPMENT -> tractors, implements, pumps, hand tools etc.
|   INPUTS    -> fertilizers, pesticides and other farm chemicals
|
| Categories with requiresExpiry: true are chemicals that must carry an
| expiry date. Expired products cannot be listed or bought.
|
| The app should use GET /api/market/meta to build its dropdowns
| instead of hardcoding these values.
|
*/

export const LISTING_KINDS = ['PRODUCE', 'EQUIPMENT', 'INPUTS'];

export const MARKET_CATEGORIES = [
  // PRODUCE
  {
    key: 'grains',
    label: 'Grains & Cereals',
    kind: 'PRODUCE',
    examples: ['Wheat', 'Rice', 'Maize', 'Jowar', 'Bajra'],
  },
  {
    key: 'pulses',
    label: 'Pulses',
    kind: 'PRODUCE',
    examples: ['Tur', 'Chana', 'Moong', 'Urad', 'Masoor'],
  },
  {
    key: 'oilseeds',
    label: 'Oilseeds',
    kind: 'PRODUCE',
    examples: ['Soybean', 'Groundnut', 'Mustard', 'Sunflower'],
  },
  {
    key: 'vegetables',
    label: 'Vegetables',
    kind: 'PRODUCE',
    examples: ['Onion', 'Potato', 'Tomato', 'Brinjal'],
  },
  {
    key: 'fruits',
    label: 'Fruits',
    kind: 'PRODUCE',
    examples: ['Apple', 'Banana', 'Mango', 'Grapes', 'Pomegranate'],
  },
  {
    key: 'spices',
    label: 'Spices',
    kind: 'PRODUCE',
    examples: ['Turmeric', 'Chilli', 'Coriander', 'Cumin'],
  },
  {
    key: 'cash_crops',
    label: 'Cash Crops',
    kind: 'PRODUCE',
    examples: ['Cotton', 'Sugarcane', 'Jute'],
  },
  { key: 'flowers', label: 'Flowers', kind: 'PRODUCE', examples: ['Marigold', 'Rose', 'Jasmine'] },
  { key: 'seeds', label: 'Seeds', kind: 'PRODUCE', examples: ['Soybean seed', 'Wheat seed'] },
  {
    key: 'fodder',
    label: 'Fodder',
    kind: 'PRODUCE',
    examples: ['Dry fodder', 'Green fodder', 'Silage'],
  },
  {
    key: 'dairy_poultry',
    label: 'Dairy & Poultry Products',
    kind: 'PRODUCE',
    examples: ['Milk', 'Ghee', 'Eggs'],
  },
  { key: 'other_produce', label: 'Other Produce', kind: 'PRODUCE', examples: [] },

  // EQUIPMENT
  {
    key: 'tractor',
    label: 'Tractors',
    kind: 'EQUIPMENT',
    examples: ['Mahindra 575', 'Swaraj 744', 'Sonalika DI 745'],
  },
  {
    key: 'tillage',
    label: 'Tillage Implements',
    kind: 'EQUIPMENT',
    examples: ['Rotavator', 'Cultivator', 'Plough', 'Harrow'],
  },
  {
    key: 'sowing',
    label: 'Sowing & Planting',
    kind: 'EQUIPMENT',
    examples: ['Seed drill', 'Planter', 'Transplanter'],
  },
  {
    key: 'harvesting',
    label: 'Harvesting',
    kind: 'EQUIPMENT',
    examples: ['Combine harvester', 'Reaper', 'Thresher'],
  },
  {
    key: 'spraying',
    label: 'Sprayers',
    kind: 'EQUIPMENT',
    examples: ['Battery sprayer', 'Boom sprayer'],
  },
  {
    key: 'irrigation',
    label: 'Irrigation',
    kind: 'EQUIPMENT',
    examples: ['Water pump', 'Drip kit', 'Sprinkler', 'HDPE pipes'],
  },
  {
    key: 'trolley_transport',
    label: 'Trolleys & Transport',
    kind: 'EQUIPMENT',
    examples: ['Tractor trolley', 'Tanker'],
  },
  {
    key: 'hand_tools',
    label: 'Hand Tools',
    kind: 'EQUIPMENT',
    examples: ['Shovel', 'Spade', 'Sickle', 'Hoe', 'Pickaxe', 'Pruning shears', 'Khurpi'],
  },
  {
    key: 'tools',
    label: 'Power Tools',
    kind: 'EQUIPMENT',
    examples: ['Chaff cutter', 'Brush cutter', 'Power weeder'],
  },
  { key: 'other_equipment', label: 'Other Equipment', kind: 'EQUIPMENT', examples: [] },

  // INPUTS
  {
    key: 'fertilizers',
    label: 'Fertilizers',
    kind: 'INPUTS',
    examples: ['Urea', 'DAP', 'NPK 19:19:19', 'MOP', 'SSP', 'Micronutrients'],
  },
  {
    key: 'insecticides',
    label: 'Insecticides',
    kind: 'INPUTS',
    requiresExpiry: true,
    examples: ['Chlorpyrifos', 'Imidacloprid', 'Emamectin benzoate'],
  },
  {
    key: 'herbicides',
    label: 'Herbicides / Weedicides',
    kind: 'INPUTS',
    requiresExpiry: true,
    examples: ['Glyphosate', 'Atrazine', '2,4-D'],
  },
  {
    key: 'fungicides',
    label: 'Fungicides',
    kind: 'INPUTS',
    requiresExpiry: true,
    examples: ['Mancozeb', 'Carbendazim', 'Copper oxychloride'],
  },
  {
    key: 'growth_regulators',
    label: 'Plant Growth Regulators',
    kind: 'INPUTS',
    requiresExpiry: true,
    examples: ['Gibberellic acid', 'Humic acid', 'Seaweed extract'],
  },
  {
    key: 'bio_inputs',
    label: 'Organic & Bio Inputs',
    kind: 'INPUTS',
    examples: ['Vermicompost', 'Cow dung manure', 'Neem oil', 'Bio-fertilizer', 'Jeevamrut'],
  },
  { key: 'other_inputs', label: 'Other Inputs', kind: 'INPUTS', examples: [] },
];

export const MARKET_UNITS = [
  'kg',
  'quintal',
  'ton',
  'dozen',
  'piece',
  'crate',
  'bag',
  'litre',
  'packet',
  'bottle',
];

/*
 * Units that can only be sold in whole numbers.
 */
export const DISCRETE_UNITS = ['piece', 'dozen', 'crate', 'bag', 'packet', 'bottle'];

export const EQUIPMENT_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'needs_repair'];

export const PRODUCE_GRADES = ['A', 'B', 'C', 'ungraded'];

export const getCategory = (key) =>
  MARKET_CATEGORIES.find((category) => category.key === key) || null;
