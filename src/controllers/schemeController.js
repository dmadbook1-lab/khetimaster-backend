import Scheme from '../models/Scheme.js';
import { LANGUAGES, translateSchemes } from '../services/schemeTranslator.js';

const LIST_FIELDS = ['benefits', 'eligibility', 'exclusions', 'documents', 'steps'];

const pickLang = (req) => {
  const lang = String(req.query.lang || req.headers['accept-language'] || '')
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES[lang] ? lang : 'en';
};

// Shape the app expects: `id` is the slug, internals are hidden. When a
// translation exists for `lang` it replaces the English text.
const toClient = (doc, lang = 'en') => {
  const { slug, _id, __v, order, isActive, createdAt, updatedAt, translations, translatedHash, ...rest } = doc;
  const out = { id: slug, ...rest, updatedAt, lang: 'en' };
  const tr = lang !== 'en' ? translations?.[lang] : null;
  if (tr) {
    for (const f of ['name', 'category', 'level', 'desc']) if (tr[f]) out[f] = tr[f];
    for (const f of LIST_FIELDS) if (tr[f]?.length === out[f]?.length) out[f] = tr[f];
    // English category stays available as a stable key for filtering
    out.categoryKey = doc.category;
    if (tr.ruleLabels?.length === out.rules?.length) {
      out.rules = out.rules.map((r, i) => ({ ...r, label: tr.ruleLabels[i] || r.label }));
    }
    out.lang = lang;
  } else {
    out.categoryKey = doc.category;
  }
  return out;
};

export async function listSchemes(req, res) {
  try {
    const { category } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = String(category);

    const lang = pickLang(req);
    const docs = await Scheme.find(filter).sort({ order: 1, name: 1 }).lean();

    return res.status(200).json({
      success: true,
      count: docs.length,
      data: docs.map((d) => toClient(d, lang)),
    });
  } catch (error) {
    console.error('List schemes error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch government schemes' });
  }
}

export async function getScheme(req, res) {
  try {
    const doc = await Scheme.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Scheme not found' });
    return res.status(200).json({ success: true, data: toClient(doc, pickLang(req)) });
  } catch (error) {
    console.error('Get scheme error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch scheme' });
  }
}

// Live catalogue statistics, computed from the database on every call.
export async function getSchemeStats(req, res) {
  try {
    const docs = await Scheme.find({ isActive: true })
      .select('category level popular isNew updatedAt translatedAt translations')
      .lean();

    const tally = (key) =>
      Object.entries(
        docs.reduce((acc, d) => ({ ...acc, [d[key]]: (acc[d[key]] || 0) + 1 }), {}),
      ).map(([name, count]) => ({ name, count }));

    const weekAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return res.status(200).json({
      success: true,
      data: {
        total: docs.length,
        popular: docs.filter((d) => d.popular).length,
        new: docs.filter((d) => d.isNew).length,
        updatedLast30Days: docs.filter((d) => new Date(d.updatedAt).getTime() > weekAgo).length,
        byCategory: tally('category').sort((a, b) => b.count - a.count),
        byLevel: tally('level'),
        translated: Object.fromEntries(
          Object.keys(LANGUAGES).map((l) => [l, docs.filter((d) => d.translations?.[l]).length]),
        ),
        lastUpdated: docs.reduce((m, d) => (d.updatedAt > m ? d.updatedAt : m), 0) || null,
      },
    });
  } catch (error) {
    console.error('Scheme stats error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch scheme statistics' });
  }
}

// Admin: (re)translate new/changed schemes now. ?force=1 redoes all.
export async function runTranslation(req, res) {
  try {
    const result = await translateSchemes({ force: req.query.force === '1' });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Translate schemes error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
