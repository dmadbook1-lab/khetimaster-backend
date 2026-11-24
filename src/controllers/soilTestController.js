import mongoose from 'mongoose';

import SoilTest from '../models/SoilTest.js';
import User from '../models/User.js';
import { createBooking, fetchReport, isConfigured } from '../services/ekosightService.js';

const REFRESH_AFTER_MS = 10 * 60 * 1000;

const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const validate = (b) => {
  const errors = {};
  const firstName = text(b.firstName, 60);
  const lastName = text(b.lastName, 60);
  const mobileNo = text(b.mobileNo, 15);
  const emailId = text(b.emailId, 120);
  const address = text(b.address, 250);
  const city = text(b.city, 80);
  const state = text(b.state, 80);
  const pincode = Number(b.pincode);
  const farmSize = Number(b.farmSize);
  const farmSizeUnit = b.farmSizeUnit;
  const previousCrop = text(b.previousCrop, 80);
  const nextCrop = text(b.nextCrop, 80);

  if (!firstName) errors.firstName = 'required';
  if (!lastName) errors.lastName = 'required';
  if (!/^[0-9]{10}$/.test(mobileNo)) errors.mobileNo = 'invalid';
  if (emailId && !/^\S+@\S+\.\S+$/.test(emailId)) errors.emailId = 'invalid';
  if (!address) errors.address = 'required';
  if (!city) errors.city = 'required';
  if (!state) errors.state = 'required';
  if (!Number.isInteger(pincode) || pincode < 100000 || pincode > 999999) errors.pincode = 'invalid';
  if (!(farmSize > 0) || Math.round(farmSize * 100) / 100 !== farmSize) errors.farmSize = 'invalid';
  if (!['Acres', 'Hectares'].includes(farmSizeUnit)) errors.farmSizeUnit = 'invalid';
  if (!previousCrop) errors.previousCrop = 'required';
  if (!nextCrop) errors.nextCrop = 'required';

  return {
    errors,
    value: {
      firstName, lastName, mobileNo, emailId, address, city, state, pincode,
      farmSize, farmSizeUnit, previousCrop, nextCrop,
      comment: text(b.comment, 120),
      farmField: mongoose.Types.ObjectId.isValid(b.farmField) ? b.farmField : null,
    },
  };
};

const toClient = (doc) => {
  const { __v, bookingResponse, ...rest } = doc;
  return rest;
};

// Pull the report from the partner and store it when it is final.
export async function syncReport(test) {
  test.lastCheckedAt = new Date();
  if (test.sampleId) {
    const report = await fetchReport(test.sampleId);
    if (report) {
      test.report = report;
      test.reportFetchedAt = new Date();
      test.status = 'completed';
    }
  }
  await test.save();
  return test;
}

export async function createSoilTest(req, res) {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: 'Soil testing is not available right now' });
    }
    const { errors, value } = validate(req.body || {});
    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, message: 'Please check the highlighted fields', errors });
    }

    const userId = req.user.userId;
    const user = await User.findById(userId).select('_id').lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    const partner = await createBooking({
      first_name: value.firstName,
      last_name: value.lastName,
      mobile_no: value.mobileNo,
      ...(value.emailId && { email_id: value.emailId }),
      address: value.address,
      city: value.city,
      state: value.state,
      pincode: value.pincode,
      farm_size: value.farmSize,
      farm_size_unit: value.farmSizeUnit,
      previous_crop: value.previousCrop,
      next_crop: value.nextCrop,
      comment: value.comment || String(userId),
      test_status: 'Pending',
    });

    if (!partner.sampleIds.length) {
      console.error('Soil booking: no sample id found in partner response:', JSON.stringify(partner.raw));
    }

    const test = await SoilTest.create({
      ...value,
      user: userId,
      sampleId: partner.sampleIds[0] || '',
      bookingResponse: partner.raw,
    });

    return res.status(201).json({ success: true, data: toClient(test.toObject()) });
  } catch (error) {
    console.error('Create soil test error:', error.response?.data || error.message);
    const status = error.response?.status;
    return res.status(status === 400 || status === 422 ? 400 : 502).json({
      success: false,
      message:
        status === 400 || status === 422
          ? 'The soil lab rejected the booking details. Please check them and try again.'
          : 'Could not reach the soil testing service. Please try again.',
    });
  }
}

export async function getMySoilTests(req, res) {
  try {
    const docs = await SoilTest.find({ user: req.user.userId })
      .select('-bookingResponse -report -__v')
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({ success: true, count: docs.length, data: docs });
  } catch (error) {
    console.error('List soil tests error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch soil tests' });
  }
}

export async function getSoilTest(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Soil test not found' });
    }
    const test = await SoilTest.findOne({ _id: req.params.id, user: req.user.userId });
    if (!test) return res.status(404).json({ success: false, message: 'Soil test not found' });

    // Opening a pending test checks for a finished report (at most every 10 min).
    const stale = !test.lastCheckedAt || Date.now() - test.lastCheckedAt.getTime() > REFRESH_AFTER_MS;
    if (test.status === 'booked' && test.sampleId && stale && isConfigured()) {
      try {
        await syncReport(test);
      } catch (error) {
        console.error('Soil report sync failed:', error.message);
      }
    }
    return res.status(200).json({ success: true, data: toClient(test.toObject()) });
  } catch (error) {
    console.error('Get soil test error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch soil test' });
  }
}

export async function refreshSoilTest(req, res) {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: 'Soil testing is not available right now' });
    }
    const test = await SoilTest.findOne({ _id: req.params.id, user: req.user.userId });
    if (!test) return res.status(404).json({ success: false, message: 'Soil test not found' });
    await syncReport(test);
    return res.status(200).json({ success: true, data: toClient(test.toObject()) });
  } catch (error) {
    console.error('Refresh soil test error:', error.response?.data || error.message);
    return res.status(502).json({ success: false, message: 'Could not check the report right now' });
  }
}

// Used by the background job: check every booked test that has a sample id.
export async function syncPendingSoilTests(limit = 100) {
  if (!isConfigured()) return { checked: 0, completed: 0 };
  const pending = await SoilTest.find({ status: 'booked', sampleId: { $ne: '' } })
    .sort({ lastCheckedAt: 1 })
    .limit(limit);
  let completed = 0;
  for (const test of pending) {
    try {
      await syncReport(test);
      if (test.status === 'completed') completed += 1;
    } catch (error) {
      console.error(`Soil report sync ${test.sampleId} failed:`, error.message);
    }
  }
  return { checked: pending.length, completed };
}
