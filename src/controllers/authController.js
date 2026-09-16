import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

import Otp from '../models/Otp.js';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';

import sendOtpEmail from '../services/emailService.js';
import { generateAuthTokens } from '../services/tokenService.js';

/*
|--------------------------------------------------------------------------
| SEND OTP
|--------------------------------------------------------------------------
*/

export const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    const otp = randomInt(100000, 1000000).toString();

    const otpHash = await bcrypt.hash(otp, 10);

    const expiryMinutes =
      Number(process.env.OTP_EXPIRY_MINUTES) || 5;

    const expiresAt = new Date(
      Date.now() + expiryMinutes * 60 * 1000,
    );

    await Otp.deleteMany({
      email: normalizedEmail,
    });

    await Otp.create({
      email: normalizedEmail,
      otpHash,
      expiresAt,
      attempts: 0,
    });

    await sendOtpEmail(normalizedEmail, otp);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (error) {
    console.error('Send OTP error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
    });
  }
};

/*
|--------------------------------------------------------------------------
| VERIFY OTP
|--------------------------------------------------------------------------
*/

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.trim();

    if (!/^\d{6}$/.test(normalizedOtp)) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be a 6-digit number',
      });
    }

    const otpRecord = await Otp.findOne({
      email: normalizedEmail,
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message:
          'OTP expired or not found. Please request a new OTP',
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      await Otp.deleteOne({
        _id: otpRecord._id,
      });

      return res.status(400).json({
        success: false,
        message:
          'OTP has expired. Please request a new OTP',
      });
    }

    if (otpRecord.attempts >= 5) {
      await Otp.deleteOne({
        _id: otpRecord._id,
      });

      return res.status(429).json({
        success: false,
        message:
          'Too many incorrect attempts. Please request a new OTP',
      });
    }

    const isOtpValid = await bcrypt.compare(
      normalizedOtp,
      otpRecord.otpHash,
    );

    if (!isOtpValid) {
      otpRecord.attempts += 1;

      await otpRecord.save();

      const attemptsRemaining = Math.max(
        0,
        5 - otpRecord.attempts,
      );

      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
        attemptsRemaining,
      });
    }

    await Otp.deleteOne({
      _id: otpRecord._id,
    });

    const user = await User.findOne({
      email: normalizedEmail,
    });

    /*
    |--------------------------------------------------------------------------
    | EXISTING USER
    |--------------------------------------------------------------------------
    */

    if (user) {
      const {
        accessToken,
        refreshToken,
      } = await generateAuthTokens(user);

      return res.status(200).json({
        success: true,
        isNewUser: false,
        profileCompleted: user.profileCompleted,
        message: 'OTP verified successfully',

        user: {
          id: user._id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          fullName: user.fullName,
          state: user.state,
          district: user.district,
          taluka: user.taluka,
          village: user.village,
          profileCompleted: user.profileCompleted,
        },

        tokens: {
          accessToken,
          refreshToken,
        },
      });
    }

    /*
    |--------------------------------------------------------------------------
    | NEW USER
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,
      isNewUser: true,
      profileCompleted: false,
      message: 'OTP verified. Profile setup required',
    });
  } catch (error) {
    console.error('Verify OTP error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
    });
  }
};

/*
|--------------------------------------------------------------------------
| COMPLETE PROFILE
|--------------------------------------------------------------------------
*/

export const completeProfile = async (req, res) => {
  try {
    const {
      email,
      phoneNumber,
      fullName,
      state,
      district,
      taluka,
      village,
    } = req.body;

    if (
      !email ||
      !phoneNumber ||
      !fullName ||
      !state ||
      !district ||
      !taluka ||
      !village
    ) {
      return res.status(400).json({
        success: false,
        message: 'All profile fields are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const phoneNumberValue = String(phoneNumber).trim();
    const fullNameValue = String(fullName).trim();
    const stateValue = String(state).trim();
    const districtValue = String(district).trim();
    const talukaValue = String(taluka).trim();
    const villageValue = String(village).trim();

    if (
      !phoneNumberValue ||
      !fullNameValue ||
      !stateValue ||
      !districtValue ||
      !talukaValue ||
      !villageValue
    ) {
      return res.status(400).json({
        success: false,
        message: 'All profile fields are required',
      });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists',
      });
    }

    const user = await User.create({
      email: normalizedEmail,
      phoneNumber: phoneNumberValue,
      fullName: fullNameValue,
      state: stateValue,
      district: districtValue,
      taluka: talukaValue,
      village: villageValue,
      profileCompleted: true,
    });

    const {
      accessToken,
      refreshToken,
    } = await generateAuthTokens(user);

    return res.status(201).json({
      success: true,
      message: 'Profile completed successfully',

      user: {
        id: user._id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        state: user.state,
        district: user.district,
        taluka: user.taluka,
        village: user.village,
        profileCompleted: user.profileCompleted,
      },

      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Complete profile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to complete profile',
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE PROFILE
|--------------------------------------------------------------------------
*/

export const updateProfile = async (req, res) => {
  try {
    const {
      phoneNumber,
      fullName,
      state,
      district,
      taluka,
      village,
    } = req.body;

    const updateData = {};

    if (phoneNumber !== undefined) {
      const value = String(phoneNumber).trim();

      if (!value) {
        return res.status(400).json({
          success: false,
          message: 'Phone number cannot be empty',
        });
      }

      updateData.phoneNumber = value;
    }

    if (fullName !== undefined) {
      const value = String(fullName).trim();

      if (!value) {
        return res.status(400).json({
          success: false,
          message: 'Full name cannot be empty',
        });
      }

      updateData.fullName = value;
    }

    if (state !== undefined) {
      const value = String(state).trim();

      if (!value) {
        return res.status(400).json({
          success: false,
          message: 'State cannot be empty',
        });
      }

      updateData.state = value;
    }

    if (district !== undefined) {
      const value = String(district).trim();

      if (!value) {
        return res.status(400).json({
          success: false,
          message: 'District cannot be empty',
        });
      }

      updateData.district = value;
    }

    if (taluka !== undefined) {
      const value = String(taluka).trim();

      if (!value) {
        return res.status(400).json({
          success: false,
          message: 'Taluka cannot be empty',
        });
      }

      updateData.taluka = value;
    }

    if (village !== undefined) {
      const value = String(village).trim();

      if (!value) {
        return res.status(400).json({
          success: false,
          message: 'Village cannot be empty',
        });
      }

      updateData.village = value;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No profile data provided',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        $set: updateData,
      },
      {
        new: true,
        runValidators: true,
      },
    ).select('-__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',

      user: {
        id: user._id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        state: user.state,
        district: user.district,
        taluka: user.taluka,
        village: user.village,
        profileCompleted: user.profileCompleted,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
    });
  }
};

/*
|--------------------------------------------------------------------------
| REFRESH ACCESS TOKEN
|--------------------------------------------------------------------------
*/

export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
      });
    }

    const storedTokens = await RefreshToken.find({
      revokedAt: null,
    });

    let matchedToken = null;

    for (const storedToken of storedTokens) {
      const isMatch = await bcrypt.compare(
        refreshToken,
        storedToken.tokenHash,
      );

      if (isMatch) {
        matchedToken = storedToken;
        break;
      }
    }

    if (!matchedToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      });
    }

    if (matchedToken.expiresAt < new Date()) {
      await RefreshToken.deleteOne({
        _id: matchedToken._id,
      });

      return res.status(401).json({
        success: false,
        message: 'Refresh token expired',
      });
    }

    const user = await User.findById(
      matchedToken.userId,
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    matchedToken.revokedAt = new Date();

    await matchedToken.save();

    const {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    } = await generateAuthTokens(user);

    return res.status(200).json({
      success: true,
      message: 'Access token refreshed',

      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to refresh access token',
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET ME
|--------------------------------------------------------------------------
*/

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(
      req.user.userId,
    ).select('-__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,

      user: {
        id: user._id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        state: user.state,
        district: user.district,
        taluka: user.taluka,
        village: user.village,
        profileCompleted: user.profileCompleted,
      },
    });
  } catch (error) {
    console.error('Get me error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to get user',
    });
  }
};

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token required',
      });
    }

    const storedTokens = await RefreshToken.find({
      userId: req.user.userId,
      revokedAt: null,
    });

    let matchedToken = null;

    for (const storedToken of storedTokens) {
      const isMatch = await bcrypt.compare(
        refreshToken,
        storedToken.tokenHash,
      );

      if (isMatch) {
        matchedToken = storedToken;
        break;
      }
    }

    if (matchedToken) {
      matchedToken.revokedAt = new Date();

      await matchedToken.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to logout',
    });
  }
};