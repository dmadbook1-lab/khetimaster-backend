import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import RefreshToken from '../models/RefreshToken.js';

export const generateAccessToken = (user) =>
  jwt.sign({ userId: user._id.toString(), email: user.email }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  });

export const generateRefreshToken = async (user) => {
  const refreshToken = crypto.randomBytes(64).toString('hex');

  const tokenHash = await bcrypt.hash(refreshToken, 10);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await RefreshToken.create({ userId: user._id, tokenHash, expiresAt });

  return refreshToken;
};

export const generateAuthTokens = async (user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user);
  return { accessToken, refreshToken };
};
