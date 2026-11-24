import mongoose from 'mongoose';

/*
 * Government scheme catalogue entry. `rules` are declarative eligibility
 * criteria the mobile app evaluates against the farmer's profile.
 */
const schemeSchema = new mongoose.Schema(
  {
    // Stable slug used by the app (e.g. 'pm-kisan'); applications reference it
    slug: { type: String, required: true, unique: true, trim: true, index: true },

    name: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, required: true, trim: true, index: true },
    level: { type: String, default: 'Central', trim: true },

    icon: { type: String, default: 'users' },
    color: { type: String, default: 'green' },

    popular: { type: Boolean, default: false },
    isNew: { type: Boolean, default: false },

    desc: { type: String, default: '', trim: true },
    benefits: { type: [String], default: [] },
    eligibility: { type: [String], default: [] },
    exclusions: { type: [String], default: [] },
    documents: { type: [String], default: [] },
    steps: { type: [String], default: [] },

    officialUrl: { type: String, default: '' },
    applyUrl: { type: String, default: '' },
    helpline: { type: String, default: '' },

    rules: { type: [mongoose.Schema.Types.Mixed], default: [] },

    // { hi: {...}, mr: {...} } - translated copies of the text fields above,
    // written by services/schemeTranslator.js. English stays the source.
    translations: { type: mongoose.Schema.Types.Mixed, default: {} },
    // hash of the English text the translations were made from
    translatedHash: { type: String, default: '' },
    translatedAt: { type: Date },

    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

export default mongoose.model('Scheme', schemeSchema);
