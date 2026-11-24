import 'dotenv/config';

import mongoose from 'mongoose';

import { translateSchemes } from '../services/schemeTranslator.js';

/*
 *   npm run translate-schemes            translate new / edited schemes
 *   npm run translate-schemes -- --force redo every scheme
 */
try {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await translateSchemes({ force: process.argv.includes('--force') });
  console.log('Schemes translated:', result);
} catch (error) {
  console.error('Translating schemes failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
