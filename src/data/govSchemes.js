/*
 * Seed catalogue for the government schemes collection
 * (npm run seed-schemes). After seeding, edit schemes in the database /
 * admin panel - this file is only the starting data.
 *
 * rules are declarative: { label, op, field, ... } with op one of
 * eq | in | range | isFalse | includes | any (evaluated by the app).
 */

const schemes = [
  {
    id: 'pm-kisan',
    name: 'PM-KISAN Samman Nidhi',
    category: 'Income Support',
    level: 'Central',
    icon: 'users',
    color: 'green',
    popular: true,
    desc: 'Direct income support of ₹6,000 a year to farmer families.',
    benefits: [
      '₹6,000 per year, paid in three instalments of ₹2,000',
      'Money goes straight to your Aadhaar-linked bank account (DBT)',
    ],
    eligibility: [
      'Farmer family that owns cultivable land',
      'Land records must be in your name',
    ],
    exclusions: [
      'Income-tax payers',
      'Serving or retired government employees (except Group D / MTS)',
      'Pensioners getting ₹10,000 or more a month',
      'Institutional landholders and constitutional post holders',
      'Doctors, engineers, lawyers, CAs registered with professional bodies',
    ],
    documents: [
      'Aadhaar card',
      'Bank passbook (Aadhaar-linked)',
      'Land ownership record (khasra/khatauni/7-12)',
      'Mobile number',
    ],
    steps: [
      'Open pmkisan.gov.in and go to Farmers Corner',
      'Choose "New Farmer Registration" and enter Aadhaar and mobile',
      'Fill in state, bank and land details and submit',
      'Get your details verified by the state nodal officer',
      'Complete eKYC (OTP on the portal, or at a CSC) so instalments are released',
    ],
    officialUrl: 'https://pmkisan.gov.in',
    applyUrl: 'https://pmkisan.gov.in',
    helpline: '155261',
    rules: [
      {
        "label": "Own cultivable land",
        "op": "eq",
        "field": "landStatus",
        "value": "owner"
      },
      {
        "label": "Not an income-tax payer",
        "op": "isFalse",
        "field": "incomeTaxPayer"
      },
      {
        "label": "Not a government employee / pensioner above ₹10,000",
        "op": "isFalse",
        "field": "govtJob"
      }
    ],
  },
  {
    id: 'pmfby',
    name: 'PM Fasal Bima Yojana',
    category: 'Insurance',
    level: 'Central',
    icon: 'shield',
    color: 'orange',
    popular: true,
    desc: 'Low-premium crop insurance against yield loss from natural calamities, pests and disease.',
    benefits: [
      'Farmer pays only 2% (Kharif), 1.5% (Rabi) or 5% (commercial/horticulture crops)',
      'Government pays the rest of the premium',
      'Cover for drought, flood, hail, pest attack and post-harvest losses',
    ],
    eligibility: [
      'Farmers growing notified crops in notified areas',
      'Owner-cultivators, tenant farmers and sharecroppers can all enrol',
    ],
    exclusions: [],
    documents: [
      'Aadhaar card',
      'Bank passbook',
      'Land record or tenancy/lease agreement',
      'Sowing certificate',
    ],
    steps: [
      'Check the enrolment cut-off date for your crop and season (it is strict)',
      'Apply through your bank, a CSC, or online at pmfby.gov.in (Farmer Corner)',
      'Pay your share of the premium',
      'Keep the policy receipt; report crop loss within 72 hours on the Crop Insurance app or helpline',
    ],
    officialUrl: 'https://pmfby.gov.in',
    applyUrl: 'https://pmfby.gov.in',
    helpline: '14447',
    rules: [
      {
        "label": "Cultivate land (owner or tenant)",
        "op": "in",
        "field": "landStatus",
        "values": [
          "owner",
          "tenant"
        ]
      }
    ],
  },
  {
    id: 'kcc',
    name: 'Kisan Credit Card (KCC)',
    category: 'Credit',
    level: 'Central',
    icon: 'credit',
    color: 'yellow',
    popular: true,
    desc: 'Short-term farm credit at subsidised interest, from your bank.',
    benefits: [
      'Credit up to ₹3 lakh at 7% interest',
      '3% prompt-repayment incentive, bringing the effective rate to 4%',
      'No collateral needed up to ₹2 lakh (as per RBI norms)',
      'Also covers livestock and fisheries working capital',
    ],
    eligibility: [
      'Farmers who own or cultivate land (owner, tenant, sharecropper)',
      'Self-help groups and joint liability groups of farmers',
      'Dairy and fishery farmers can also apply',
    ],
    exclusions: [],
    documents: [
      'Aadhaar and PAN / ID proof',
      'Land record or lease document',
      'Passport photo',
      'Bank account details',
    ],
    steps: [
      'Download the KCC form from pmkisan.gov.in or collect it at your bank',
      'Fill it in and attach documents',
      'Submit at your bank branch, cooperative bank or CSC',
      'The bank verifies land and issues the card',
    ],
    officialUrl: 'https://pmkisan.gov.in',
    applyUrl: 'https://pmkisan.gov.in',
    rules: [
      {
        "label": "Farmer, tenant, sharecropper, or in fisheries/livestock",
        "op": "any",
        "conditions": [
          {
            "op": "in",
            "field": "landStatus",
            "values": [
              "owner",
              "tenant"
            ]
          },
          {
            "op": "includes",
            "field": "activities",
            "value": "fisheries",
            "unknownIfEmpty": false
          },
          {
            "op": "includes",
            "field": "activities",
            "value": "livestock",
            "unknownIfEmpty": false
          }
        ]
      }
    ],
  },
  {
    id: 'soil-health-card',
    name: 'Soil Health Card Scheme',
    category: 'Soil',
    level: 'Central',
    icon: 'sprout',
    color: 'purple',
    popular: true,
    desc: 'Free soil testing and crop-wise fertiliser recommendations.',
    benefits: [
      'Free soil test for your field',
      'A card with nutrient status and fertiliser advice for each crop',
      'Helps cut fertiliser cost and improve yield',
    ],
    eligibility: ['All farmers can get a Soil Health Card'],
    exclusions: [],
    documents: ['Farmer ID / Aadhaar', 'Land details (survey number)'],
    steps: [
      'Open soilhealth.dac.gov.in and register as a farmer',
      'Or contact your local agriculture office / Krishi Vigyan Kendra',
      'Give your soil sample as guided and collect the card when ready',
    ],
    officialUrl: 'https://soilhealth.dac.gov.in',
    applyUrl: 'https://soilhealth.dac.gov.in',
    rules: [
      {
        "label": "Farmer",
        "op": "in",
        "field": "landStatus",
        "values": [
          "owner",
          "tenant"
        ]
      }
    ],
  },
  {
    id: 'pmksy',
    name: 'PM Krishi Sinchayee Yojana (Per Drop More Crop)',
    category: 'Irrigation',
    level: 'Central',
    icon: 'droplet',
    color: 'blue',
    popular: true,
    desc: 'Subsidy on drip and sprinkler irrigation to save water and raise yield.',
    benefits: [
      'About 55% subsidy for small & marginal farmers',
      'About 45% subsidy for other farmers',
      'Exact rates and caps are set by each state',
    ],
    eligibility: [
      'Farmers with their own land and a water source',
      'Small and marginal farmers get the higher subsidy',
    ],
    exclusions: [],
    documents: [
      'Aadhaar card',
      'Land record',
      'Bank passbook',
      'Water source proof / quotation from an approved dealer',
    ],
    steps: [
      'Apply on your state horticulture / agriculture department portal',
      'Select an approved micro-irrigation supplier and get a quotation',
      'Get the field inspected, install the system and claim the subsidy',
    ],
    officialUrl: 'https://pmksy.gov.in',
    applyUrl: 'https://pmksy.gov.in',
    rules: [
      {
        "label": "Own cultivable land",
        "op": "eq",
        "field": "landStatus",
        "value": "owner"
      }
    ],
  },
  {
    id: 'pm-kusum',
    name: 'PM-KUSUM (Solar Pump Subsidy)',
    category: 'Energy',
    level: 'Central',
    icon: 'sun',
    color: 'orange',
    isNew: true,
    desc: 'Solar pumps and grid-connected solar power for farmers.',
    benefits: [
      'Central subsidy of 30% plus a further state subsidy of about 30% on solar pumps',
      'Farmer pays about 40% (30% can be financed by a bank loan)',
      'Sell surplus solar power to the grid and earn extra income',
    ],
    eligibility: [
      'Individual farmers, groups, FPOs and cooperatives',
      'Land and a water source (borewell/open well) for standalone pumps',
    ],
    exclusions: [],
    documents: [
      'Aadhaar card',
      'Land record',
      'Bank passbook',
      'Water source details',
    ],
    steps: [
      'Register on your state nodal agency (discom / renewable energy) portal',
      'See pmkusum.mnre.gov.in for the state-wise list of agencies',
      'Pay your share and get the pump installed by an empanelled vendor',
    ],
    officialUrl: 'https://pmkusum.mnre.gov.in',
    applyUrl: 'https://pmkusum.mnre.gov.in',
    rules: [
      {
        "label": "Own cultivable land",
        "op": "eq",
        "field": "landStatus",
        "value": "owner"
      }
    ],
  },
  {
    id: 'pm-kmy',
    name: 'PM Kisan Maandhan Yojana (Pension)',
    category: 'Pension',
    level: 'Central',
    icon: 'wallet',
    color: 'blue',
    desc: 'Monthly pension of ₹3,000 after age 60 for small and marginal farmers.',
    benefits: [
      '₹3,000 per month pension after 60 years of age',
      'Monthly contribution of ₹55–₹200 depending on your joining age',
      'Government contributes an equal amount',
    ],
    eligibility: [
      'Age 18 to 40 years',
      'Small and marginal farmers with up to 2 hectares of land',
    ],
    exclusions: [
      'Members of NPS, ESIC or EPFO',
      'Income-tax payers',
      'Farmers already getting other pensions through these schemes',
    ],
    documents: ['Aadhaar card', 'Bank account / IFSC', 'Land record', 'Mobile number'],
    steps: [
      'Visit the nearest Common Service Centre with your documents',
      'Or self-register at maandhan.in',
      'Set up auto-debit for the monthly contribution',
    ],
    officialUrl: 'https://maandhan.in',
    applyUrl: 'https://maandhan.in',
    rules: [
      {
        "label": "Own cultivable land",
        "op": "eq",
        "field": "landStatus",
        "value": "owner"
      },
      {
        "label": "Age 18 to 40",
        "op": "range",
        "field": "age",
        "min": 18,
        "max": 40
      },
      {
        "label": "Land up to 2 hectares",
        "op": "range",
        "field": "landHa",
        "max": 2
      },
      {
        "label": "Not an income-tax payer",
        "op": "isFalse",
        "field": "incomeTaxPayer"
      }
    ],
  },
  {
    id: 'enam',
    name: 'e-NAM (National Agriculture Market)',
    category: 'Market',
    level: 'Central',
    icon: 'store',
    color: 'green',
    desc: 'Sell your produce online to buyers across India through linked mandis.',
    benefits: [
      'Transparent online bidding for better prices',
      'Wider choice of buyers beyond your local mandi',
      'Payment goes directly to your bank account',
    ],
    eligibility: ['Any farmer selling produce at an e-NAM linked mandi'],
    exclusions: [],
    documents: ['Aadhaar card', 'Bank account with IFSC', 'Mobile number'],
    steps: [
      'Register as a farmer on enam.gov.in or the e-NAM app',
      'Or register at your nearest e-NAM mandi',
      'Bring your produce to the mandi for assaying and online bidding',
    ],
    officialUrl: 'https://enam.gov.in',
    applyUrl: 'https://enam.gov.in',
    rules: [
      {
        "label": "Farmer / producer",
        "op": "in",
        "field": "landStatus",
        "values": [
          "owner",
          "tenant"
        ]
      }
    ],
  },
  {
    id: 'aif',
    name: 'Agriculture Infrastructure Fund',
    category: 'Infrastructure',
    level: 'Central',
    icon: 'warehouse',
    color: 'yellow',
    desc: 'Loans with interest relief for cold storage, warehouses and post-harvest facilities.',
    benefits: [
      '3% per year interest subvention on loans up to ₹2 crore',
      'Credit guarantee cover for eligible loans',
      'Support available for up to 7 years',
    ],
    eligibility: [
      'Farmers, FPOs, cooperatives, SHGs',
      'Agri-entrepreneurs and start-ups',
      'For projects like warehouses, cold storage, sorting/grading, processing',
    ],
    exclusions: [],
    documents: ['Aadhaar / PAN', 'Project report', 'Land or lease papers', 'Bank details'],
    steps: [
      'Register on agriinfra.dac.gov.in',
      'Upload your project report and documents',
      'Apply for a loan with a participating bank',
    ],
    officialUrl: 'https://agriinfra.dac.gov.in',
    applyUrl: 'https://agriinfra.dac.gov.in',
    rules: [
      {
        "label": "Farmer, or running a processing / storage activity",
        "op": "any",
        "conditions": [
          {
            "op": "in",
            "field": "landStatus",
            "values": [
              "owner",
              "tenant"
            ]
          },
          {
            "op": "includes",
            "field": "activities",
            "value": "processing",
            "unknownIfEmpty": false
          }
        ]
      }
    ],
  },
  {
    id: 'smam',
    name: 'Farm Mechanisation Subsidy (SMAM)',
    category: 'Subsidy',
    level: 'Central',
    icon: 'tractor',
    color: 'orange',
    desc: 'Subsidy on tractors and farm machinery, and custom hiring centres.',
    benefits: [
      '50% subsidy for SC/ST, women, small and marginal farmers',
      '40% subsidy for other farmers',
      'Support for custom hiring centres and machinery banks',
    ],
    eligibility: ['Individual farmers, groups, FPOs and cooperatives'],
    exclusions: [],
    documents: [
      'Aadhaar card',
      'Land record',
      'Bank passbook',
      'Caste certificate (if claiming SC/ST rate)',
      'Dealer quotation',
    ],
    steps: [
      'Register on agrimachinery.nic.in or your state agriculture portal',
      'Select the machine and approved dealer',
      'Get approval, buy the machine and upload invoice to claim subsidy',
    ],
    officialUrl: 'https://agrimachinery.nic.in',
    applyUrl: 'https://agrimachinery.nic.in',
    rules: [
      {
        "label": "Farmer",
        "op": "in",
        "field": "landStatus",
        "values": [
          "owner",
          "tenant"
        ]
      }
    ],
  },
  {
    id: 'midh',
    name: 'Mission for Integrated Development of Horticulture (MIDH)',
    category: 'Horticulture',
    level: 'Central',
    icon: 'sprout',
    color: 'green',
    desc: 'Subsidy for orchards, vegetables, flowers, polyhouses and post-harvest units.',
    benefits: [
      'Around 40% of the project cost as subsidy in general areas (50% in hilly / NE areas)',
      'Support for planting material, protected cultivation and cold chain',
    ],
    eligibility: ['Farmers growing fruits, vegetables, flowers, spices or plantation crops'],
    exclusions: [],
    documents: ['Aadhaar card', 'Land record', 'Bank passbook', 'Project quotation'],
    steps: [
      'Contact your District Horticulture Officer',
      'Apply on the state horticulture department portal',
      'Get the plan approved, execute it and claim the subsidy',
    ],
    officialUrl: 'https://midh.gov.in',
    applyUrl: 'https://midh.gov.in',
    rules: [
      {
        "label": "Own or cultivate land",
        "op": "in",
        "field": "landStatus",
        "values": [
          "owner",
          "tenant"
        ]
      },
      {
        "label": "Grows fruits, vegetables or flowers",
        "op": "includes",
        "field": "activities",
        "value": "horticulture"
      }
    ],
  },
  {
    id: 'pmmsy',
    name: 'PM Matsya Sampada Yojana (Fisheries)',
    category: 'Fisheries',
    level: 'Central',
    icon: 'fish',
    color: 'blue',
    desc: 'Support for fish farming, fishing boats, hatcheries and cold chain.',
    benefits: [
      '40% subsidy for general category',
      '60% subsidy for SC/ST and women beneficiaries',
      'Support for ponds, tanks, cages, boats and nets',
    ],
    eligibility: ['Fishers, fish farmers, SHGs, FPOs and entrepreneurs in fisheries'],
    exclusions: [],
    documents: ['Aadhaar card', 'Bank passbook', 'Pond/lease papers', 'Project report'],
    steps: [
      'Register at pmmsy.dof.gov.in or contact your District Fisheries Officer',
      'Submit your project proposal for approval',
      'Execute the project and claim the subsidy',
    ],
    officialUrl: 'https://pmmsy.dof.gov.in',
    applyUrl: 'https://pmmsy.dof.gov.in',
    rules: [
      {
        "label": "Engaged in fisheries",
        "op": "includes",
        "field": "activities",
        "value": "fisheries"
      }
    ],
  },
  {
    id: 'pmfme',
    name: 'PM Formalisation of Micro Food Processing (PM-FME)',
    category: 'Processing',
    level: 'Central',
    icon: 'factory',
    color: 'purple',
    desc: 'Subsidised loans to set up or upgrade small food-processing units.',
    benefits: [
      '35% credit-linked subsidy, up to ₹10 lakh per unit',
      'Training, branding and marketing support',
    ],
    eligibility: [
      'Existing micro food-processing units and new entrepreneurs',
      'Farmer producer organisations and SHGs',
    ],
    exclusions: [],
    documents: ['Aadhaar card', 'Bank details', 'Project report', 'Unit address proof'],
    steps: [
      'Apply on pmfme.mofpi.gov.in',
      'Get your project report prepared with the district resource person',
      'Apply for a loan with a bank to receive the subsidy',
    ],
    officialUrl: 'https://pmfme.mofpi.gov.in',
    applyUrl: 'https://pmfme.mofpi.gov.in',
    rules: [
      {
        "label": "Food processing activity",
        "op": "includes",
        "field": "activities",
        "value": "processing"
      }
    ],
  },
  {
    id: 'pkvy',
    name: 'Paramparagat Krishi Vikas Yojana (Organic Farming)',
    category: 'Organic',
    level: 'Central',
    icon: 'leaf',
    color: 'green',
    desc: 'Support to farmers who move to certified organic farming in groups.',
    benefits: [
      'Financial help of about ₹31,500 per hectare over three years',
      'Support for inputs, certification and marketing',
    ],
    eligibility: [
      'Farmers forming a cluster of around 50 farmers (about 20 hectares)',
      'Willing to follow organic practices',
    ],
    exclusions: [],
    documents: ['Aadhaar card', 'Land record', 'Bank passbook', 'Group membership details'],
    steps: [
      'Contact your State Agriculture Department or regional organic council',
      'Form or join a farmer cluster',
      'Follow the organic package of practices and get certified under PGS-India',
    ],
    officialUrl: 'https://pgsindia-ncof.gov.in',
    applyUrl: 'https://pgsindia-ncof.gov.in',
    rules: [
      {
        "label": "Own or cultivate land",
        "op": "in",
        "field": "landStatus",
        "values": [
          "owner",
          "tenant"
        ]
      },
      {
        "label": "Interested in organic farming",
        "op": "includes",
        "field": "activities",
        "value": "organic"
      }
    ],
  },
];

export default schemes;
