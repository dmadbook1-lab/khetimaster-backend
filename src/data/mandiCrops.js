/*
|--------------------------------------------------------------------------
| MANDI CROPS
|--------------------------------------------------------------------------
|
| id           stable key the app uses
| name         display name
| commodity    main official data.gov.in commodity name
| commodities  every official name whose prices belong to this crop.
|              data.gov.in searches by text, not exact name (asking for
|              "Kulthi(Horse Gram)" also returns Bengal Gram), so only
|              records whose commodity is in this list are kept.
|              Older spellings from the historical dataset are included.
| aliases      other names the app may send (local names, crop list
|              names from other screens)
| category     for grouping in the app
|
| Official names were checked against the "Current Daily Price of Various
| Commodities" dataset. If data.gov.in renames a commodity, add the new
| spelling to commodities.
|
*/

const MANDI_CROPS = [
  // CEREALS
  {
    id: 'rice',
    name: 'Rice',
    commodity: 'Rice',
    commodities: ['Rice'],
    aliases: ['chawal'],
    category: 'Cereals',
  },
  {
    id: 'paddy',
    name: 'Paddy',
    commodity: 'Paddy(Common)',
    commodities: ['Paddy(Common)', 'Paddy(Dhan)(Common)', 'Paddy(Basmati)', 'Paddy(Dhan)(Basmati)'],
    aliases: ['dhan', 'paddy(dhan)(common)', 'paddy(dhan)'],
    category: 'Cereals',
  },
  {
    id: 'wheat',
    name: 'Wheat',
    commodity: 'Wheat',
    commodities: ['Wheat'],
    aliases: ['gehun', 'gahu'],
    category: 'Cereals',
  },
  {
    id: 'maize',
    name: 'Maize',
    commodity: 'Maize',
    commodities: ['Maize'],
    aliases: ['makka', 'corn'],
    category: 'Cereals',
  },
  {
    id: 'bajra',
    name: 'Bajra',
    commodity: 'Bajra(Pearl Millet/Cumbu)',
    commodities: ['Bajra(Pearl Millet/Cumbu)'],
    aliases: ['pearl millet', 'cumbu'],
    category: 'Cereals',
  },
  {
    id: 'jowar',
    name: 'Jowar',
    commodity: 'Jowar(Sorghum)',
    commodities: ['Jowar(Sorghum)'],
    aliases: ['sorghum', 'jwari'],
    category: 'Cereals',
  },
  {
    id: 'ragi',
    name: 'Ragi',
    commodity: 'Ragi(Finger Millet)',
    commodities: ['Ragi (Finger Millet)', 'Ragi(Finger Millet)'],
    aliases: ['finger millet', 'nachni'],
    category: 'Cereals',
  },

  // PULSES
  {
    id: 'gram',
    name: 'Gram (Chana)',
    commodity: 'Bengal Gram(Gram)(Whole)',
    commodities: ['Bengal Gram(Gram)(Whole)'],
    aliases: ['chana', 'bengal gram', 'harbhara'],
    category: 'Pulses',
  },
  {
    id: 'arhar',
    name: 'Arhar / Tur',
    commodity: 'Red gram/Arhar/Tur(whole)',
    commodities: ['Red gram/Arhar/Tur(whole)', 'Arhar(Tur/Red Gram)(Whole)', 'Arhar (Tur)'],
    aliases: ['tur', 'toor', 'red gram', 'arhar (tur)'],
    category: 'Pulses',
  },
  {
    id: 'moong',
    name: 'Moong',
    commodity: 'Green Gram(Moong)(Whole)',
    commodities: ['Green Gram(Moong)(Whole)', 'Green Gram (Moong)(Whole)'],
    aliases: ['green gram', 'mung'],
    category: 'Pulses',
  },
  {
    id: 'urad',
    name: 'Urad',
    commodity: 'Black Gram(Urd Beans)(Whole)',
    commodities: ['Black Gram(Urd Beans)(Whole)', 'Black Gram (Urd Beans)(Whole)'],
    aliases: ['black gram', 'urd'],
    category: 'Pulses',
  },
  {
    id: 'horse-gram',
    name: 'Horse Gram (Kulthi)',
    commodity: 'Kulthi(Horse Gram)',
    commodities: ['Kulthi(Horse Gram)'],
    aliases: ['horse gram', 'kulthi', 'kulthi (horse gram)'],
    category: 'Pulses',
  },

  // OILSEEDS
  {
    id: 'soybean',
    name: 'Soybean',
    commodity: 'Soyabean',
    commodities: ['Soyabean'],
    aliases: ['soya', 'soyabean', 'soya bean'],
    category: 'Oilseeds',
  },
  {
    id: 'groundnut',
    name: 'Groundnut',
    commodity: 'Groundnut',
    commodities: ['Groundnut'],
    aliases: ['peanut', 'moongphali', 'shengdana'],
    category: 'Oilseeds',
  },
  {
    id: 'mustard',
    name: 'Mustard',
    commodity: 'Mustard',
    commodities: ['Mustard'],
    aliases: ['sarson', 'rai'],
    category: 'Oilseeds',
  },
  {
    id: 'sunflower',
    name: 'Sunflower',
    commodity: 'Sunflower/Sunflower Seed',
    commodities: ['Sunflower/Sunflower Seed', 'Sunflower'],
    aliases: ['sunflower seed'],
    category: 'Oilseeds',
  },
  {
    id: 'castor',
    name: 'Castor Seed',
    commodity: 'Castor Seed',
    commodities: ['Castor Seed'],
    aliases: ['castor', 'arandi'],
    category: 'Oilseeds',
  },

  // CASH CROPS
  {
    id: 'cotton',
    name: 'Cotton',
    commodity: 'Cotton',
    commodities: ['Cotton'],
    aliases: ['kapas', 'kapus'],
    category: 'Cash Crops',
  },
  {
    id: 'sugarcane',
    name: 'Sugarcane',
    commodity: 'Sugarcane',
    commodities: ['Sugarcane'],
    aliases: ['ganna', 'oos'],
    category: 'Cash Crops',
  },

  // SPICES
  {
    id: 'chilli',
    name: 'Chilli',
    commodity: 'Green Chilli',
    commodities: ['Green Chilli', 'Dry Chillies'],
    aliases: ['mirchi', 'green chilli', 'dry chilli'],
    category: 'Spices',
  },
  {
    id: 'turmeric',
    name: 'Turmeric',
    commodity: 'Turmeric',
    commodities: ['Turmeric'],
    aliases: ['haldi', 'halad'],
    category: 'Spices',
  },
  {
    id: 'garlic',
    name: 'Garlic',
    commodity: 'Garlic',
    commodities: ['Garlic'],
    aliases: ['lahsun', 'lasun'],
    category: 'Spices',
  },
  {
    id: 'cumin',
    name: 'Cumin (Jeera)',
    commodity: 'Cummin Seed(Jeera)',
    commodities: ['Cummin Seed(Jeera)'],
    aliases: ['jeera', 'cumin'],
    category: 'Spices',
  },
  {
    id: 'coriander',
    name: 'Coriander',
    commodity: 'Coriander(Leaves)',
    commodities: ['Coriander(Leaves)'],
    aliases: ['dhania', 'kothimbir'],
    category: 'Spices',
  },

  // VEGETABLES
  {
    id: 'onion',
    name: 'Onion',
    commodity: 'Onion',
    commodities: ['Onion'],
    aliases: ['pyaz', 'kanda'],
    category: 'Vegetables',
  },
  {
    id: 'potato',
    name: 'Potato',
    commodity: 'Potato',
    commodities: ['Potato'],
    aliases: ['aloo', 'batata'],
    category: 'Vegetables',
  },
  {
    id: 'tomato',
    name: 'Tomato',
    commodity: 'Tomato',
    commodities: ['Tomato'],
    aliases: ['tamatar'],
    category: 'Vegetables',
  },
  {
    id: 'brinjal',
    name: 'Brinjal',
    commodity: 'Brinjal',
    commodities: ['Brinjal'],
    aliases: ['baingan', 'vangi', 'eggplant'],
    category: 'Vegetables',
  },
  {
    id: 'cauliflower',
    name: 'Cauliflower',
    commodity: 'Cauliflower',
    commodities: ['Cauliflower'],
    aliases: ['gobi', 'phool gobi'],
    category: 'Vegetables',
  },
  {
    id: 'cabbage',
    name: 'Cabbage',
    commodity: 'Cabbage',
    commodities: ['Cabbage'],
    aliases: ['patta gobi'],
    category: 'Vegetables',
  },

  // FRUITS
  {
    id: 'banana',
    name: 'Banana',
    commodity: 'Banana',
    commodities: ['Banana'],
    aliases: ['kela', 'keli'],
    category: 'Fruits',
  },
  {
    id: 'apple',
    name: 'Apple',
    commodity: 'Apple',
    commodities: ['Apple'],
    aliases: ['seb'],
    category: 'Fruits',
  },
  {
    id: 'grapes',
    name: 'Grapes',
    commodity: 'Grapes',
    commodities: ['Grapes'],
    aliases: ['angoor', 'draksha'],
    category: 'Fruits',
  },
  {
    id: 'pomegranate',
    name: 'Pomegranate',
    commodity: 'Pomegranate',
    commodities: ['Pomegranate'],
    aliases: ['anar', 'dalimb'],
    category: 'Fruits',
  },
  {
    id: 'lemon',
    name: 'Lemon',
    commodity: 'Lemon',
    commodities: ['Lemon'],
    aliases: ['nimbu', 'limbu'],
    category: 'Fruits',
  },
];

export default MANDI_CROPS;
