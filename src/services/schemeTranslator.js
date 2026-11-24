import crypto from 'crypto';
import axios from 'axios';

import Scheme from '../models/Scheme.js';

/*
 * Translates scheme text into Hindi and Marathi with the OpenAI API
 * (same OPENAI_API_KEY / OPENAI_MODEL as AI Guru) and stores it on the
 * scheme as `translations.hi` / `translations.mr`.
 *
 * Only schemes whose English text changed since the last translation are
 * sent (compared by hash), so the daily job is cheap.
 */

export const LANGUAGES = { hi: 'Hindi', mr: 'Marathi' };

const TEXT_FIELDS = ['name', 'category', 'level', 'desc'];
const LIST_FIELDS = ['benefits', 'eligibility', 'exclusions', 'documents', 'steps'];

// The English text that gets translated, in a stable shape.
export const extractSource = (doc) => ({
  ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, doc[f] || ''])),
  ...Object.fromEntries(LIST_FIELDS.map((f) => [f, doc[f] || []])),
  ruleLabels: (doc.rules || []).map((r) => r?.label || ''),
});

export const hashSource = (doc) =>
  crypto.createHash('sha1').update(JSON.stringify(extractSource(doc))).digest('hex');

const hasKey = () => Boolean(String(process.env.OPENAI_API_KEY ?? '').trim());

const translateOne = async (source, langName) => {
  const { data } = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            `You translate Indian government agriculture scheme text from English into ${langName} ` +
            'for farmers with simple everyday vocabulary. Return JSON with EXACTLY the same keys and ' +
            'array lengths as the input. Keep numbers, ₹ amounts, percentages, URLs, phone numbers and ' +
            'official acronyms (PM-KISAN, KCC, eNAM, Aadhaar, DBT, CSC...) unchanged. Translate every ' +
            'other word. Do not add or drop items.',
        },
        { role: 'user', content: JSON.stringify(source) },
      ],
    },
    {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      timeout: 90000,
    },
  );

  const parsed = JSON.parse(data.choices[0].message.content);

  // Guard against dropped items: fall back to English for any mismatch.
  const out = {};
  for (const f of TEXT_FIELDS) out[f] = typeof parsed[f] === 'string' && parsed[f] ? parsed[f] : source[f];
  for (const f of [...LIST_FIELDS, 'ruleLabels']) {
    out[f] =
      Array.isArray(parsed[f]) && parsed[f].length === source[f].length ? parsed[f].map(String) : source[f];
  }
  return out;
};

export async function translateScheme(doc) {
  const source = extractSource(doc);
  const translations = {};
  for (const [code, name] of Object.entries(LANGUAGES)) {
    translations[code] = await translateOne(source, name);
  }
  return translations;
}

/*
 * Translate every active scheme that is new or changed (or all, with force).
 * Returns { translated, skipped, failed }.
 */
export async function translateSchemes({ force = false } = {}) {
  if (!hasKey()) throw new Error('OPENAI_API_KEY is not set');

  const result = { translated: 0, skipped: 0, failed: 0 };
  const docs = await Scheme.find({ isActive: true }).lean();

  for (const doc of docs) {
    const hash = hashSource(doc);
    if (!force && doc.translatedHash === hash && doc.translations?.hi && doc.translations?.mr) {
      result.skipped += 1;
      continue;
    }
    try {
      const translations = await translateScheme(doc);
      await Scheme.updateOne(
        { _id: doc._id },
        { $set: { translations, translatedHash: hash, translatedAt: new Date() } },
      );
      result.translated += 1;
    } catch (error) {
      console.error(`Translate scheme ${doc.slug} failed:`, error.message);
      result.failed += 1;
    }
  }
  return result;
}
