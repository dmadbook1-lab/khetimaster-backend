import cron from 'node-cron';

import { translateSchemes } from '../services/schemeTranslator.js';

// Daily: translate schemes that are new or edited (no-op when nothing changed).
export function startSchemeTranslationJob() {
  if (!String(process.env.OPENAI_API_KEY ?? '').trim()) {
    console.log('Scheme translation job skipped (no OPENAI_API_KEY)');
    return;
  }
  console.log('Scheme translation job scheduled daily at 03:30');
  cron.schedule('30 3 * * *', async () => {
    try {
      const r = await translateSchemes();
      console.log('Scheme translation done:', r);
    } catch (error) {
      console.error('Scheme translation failed:', error.message);
    }
  });
}
