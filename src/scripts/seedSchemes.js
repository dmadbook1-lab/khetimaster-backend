import 'dotenv/config';

import mongoose from 'mongoose';

import Scheme from '../models/Scheme.js';
import schemes from '../data/govSchemes.js';

/*
 * Load the starting scheme catalogue.
 *
 *   npm run seed-schemes           insert missing schemes only (keeps your edits)
 *   npm run seed-schemes -- --force  overwrite existing schemes with seed data
 */

const force = process.argv.includes('--force');

try {
  await mongoose.connect(process.env.MONGO_URI);

  let created = 0;
  let updated = 0;

  for (const [index, { id, ...data }] of schemes.entries()) {
    const doc = { ...data, slug: id, order: index };
    const exists = await Scheme.exists({ slug: id });

    if (!exists) {
      await Scheme.create(doc);
      created += 1;
    } else if (force) {
      await Scheme.updateOne({ slug: id }, { $set: doc });
      updated += 1;
    }
  }

  console.log(`Schemes seeded: ${created} created, ${updated} updated.`);
} catch (error) {
  console.error('Seeding schemes failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
