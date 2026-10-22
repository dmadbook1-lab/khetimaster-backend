/*
|--------------------------------------------------------------------------
| DOCTOR OPTIONS
|--------------------------------------------------------------------------
|
| Values for the doctor profile and consultation forms. The app should
| use GET /api/doctors/meta instead of hardcoding these.
|
| specialization, problemType and animalType are free text (older data
| may contain any value); the lists below are suggestions.
|
*/

export const DOCTOR_TYPES = [
  { key: 'veterinarian', label: 'Veterinarian', consultationType: 'veterinary' },
  { key: 'agriculturalDoctor', label: 'Agricultural Doctor', consultationType: 'agricultural' },
];

export const CONSULTATION_TYPES = ['veterinary', 'agricultural'];

export const SPECIALIZATIONS = {
  veterinarian: [
    'Cattle',
    'Buffalo',
    'Goat & Sheep',
    'Poultry',
    'Pig',
    'Dog & Pets',
    'Artificial Insemination',
    'Surgery',
  ],
  agriculturalDoctor: [
    'Plant Pathology',
    'Entomology (Pests)',
    'Soil Science',
    'Horticulture',
    'Agronomy',
    'Irrigation',
    'Organic Farming',
    'Seed Technology',
  ],
};

export const PROBLEM_TYPES = {
  veterinary: [
    'Fever',
    'Not eating',
    'Low milk yield',
    'Pregnancy / delivery',
    'Injury',
    'Skin disease',
    'Diarrhoea',
    'Vaccination',
    'Other',
  ],
  agricultural: [
    'Pest attack',
    'Leaf disease',
    'Yellowing',
    'Wilting',
    'Fruit / flower drop',
    'Soil problem',
    'Nutrient deficiency',
    'Weed problem',
    'Other',
  ],
};

export const ANIMAL_TYPES = [
  'Cow',
  'Buffalo',
  'Goat',
  'Sheep',
  'Poultry',
  'Pig',
  'Dog',
  'Horse',
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

export const FEE_TYPES = ['free', 'perConsultation'];

export const AVAILABILITY_OPTIONS = ['available', 'unavailable', 'busy'];

export const PAYMENT_METHODS = ['cod', 'upi', 'card', 'wallet'];

/*
 * Length of a consultation slot when the farmer doesn't give an end time.
 */
export const DEFAULT_SLOT_MINUTES = 30;

export const MAX_IMAGES = 5;
