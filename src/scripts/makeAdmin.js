import 'dotenv/config';

import mongoose from 'mongoose';

import User from '../models/User.js';

/*
 * Give a user admin access (admin panel APIs).
 *
 *   npm run make-admin -- someone@example.com
 *   npm run make-admin -- someone@example.com --revoke
 */

const email = String(process.argv[2] || '')
  .trim()
  .toLowerCase();
const revoke = process.argv.includes('--revoke');

if (!email) {
  console.error('Usage: npm run make-admin -- <email> [--revoke]');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOneAndUpdate(
    { email },
    { $set: { role: revoke ? 'user' : 'admin' } },
    { returnDocument: 'after' }
  );

  if (!user) {
    console.error(`No user with email ${email}`);
    process.exitCode = 1;
  } else {
    console.log(`${user.email} is now ${user.role}`);
  }
} catch (error) {
  console.error('Failed to update role:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
