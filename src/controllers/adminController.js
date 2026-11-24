import * as adminService from '../admin/adminService.js';
import { AdminError } from '../admin/adminService.js';
import { refreshArticles } from '../services/articleService.js';
import SoilTest from '../models/SoilTest.js';
import Scheme from '../models/Scheme.js';
import { isConfigured as soilConfigured } from '../services/ekosightService.js';
import { syncReport, syncPendingSoilTests } from './soilTestController.js';
import { translateSchemes } from '../services/schemeTranslator.js';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const sendError = (res, error, fallbackMessage) => {
  if (error instanceof AdminError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(fallbackMessage, error);

  return res.status(500).json({ success: false, message: fallbackMessage });
};

const handle = (fallbackMessage, run) => async (req, res) => {
  try {
    const result = await run(req);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, fallbackMessage);
  }
};

/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

export const getDashboard = handle('Failed to load dashboard', () => adminService.getDashboard());

export const getOptions = handle('Failed to load options', (req) =>
  adminService.getOptions(req.params.key)
);

/*
|--------------------------------------------------------------------------
| USERS
|--------------------------------------------------------------------------
*/

export const listUsers = handle('Failed to load users', (req) => adminService.listUsers(req.query));

export const getUser = handle('Failed to load user', (req) => adminService.getUser(req.params.id));

export const updateUser = handle('Failed to update user', (req) =>
  adminService.updateUser(req.params.id, req.body, req.user.userId)
);

export const deleteUser = handle('Failed to delete user', (req) =>
  adminService.deleteUser(req.params.id, req.user.userId)
);

/*
|--------------------------------------------------------------------------
| GENERIC RESOURCES
|--------------------------------------------------------------------------
*/

export const listResource = handle('Failed to load records', (req) =>
  adminService.listResource(req.params.resource, req.query)
);

export const getResource = handle('Failed to load record', (req) =>
  adminService.getResource(req.params.resource, req.params.id)
);

export const updateResource = handle('Failed to update record', (req) =>
  adminService.updateResource(req.params.resource, req.params.id, req.body)
);

export const deleteResource = handle('Failed to delete record', (req) =>
  adminService.deleteResource(req.params.resource, req.params.id)
);

/*
|--------------------------------------------------------------------------
| ARTICLES
|--------------------------------------------------------------------------
*/

export const refreshArticlesNow = handle('Failed to refresh articles', async () => ({
  result: await refreshArticles(),
}));

/*
|--------------------------------------------------------------------------
| SOIL TESTS
|--------------------------------------------------------------------------
*/

const requireSoilPartner = () => {
  if (!soilConfigured()) throw new AdminError('The soil lab (Ekosight) is not configured on the server.', 503);
};

// Check the partner for one test's report now
export const refreshSoilTest = handle('Failed to check the report', async (req) => {
  requireSoilPartner();
  const test = await SoilTest.findById(req.params.id);
  if (!test) throw new AdminError('Soil test not found.', 404);
  try {
    await syncReport(test);
  } catch (error) {
    console.error('Admin soil refresh failed:', error.response?.data || error.message);
    throw new AdminError('Could not reach the soil lab right now.', 502);
  }
  return adminService.getResource('soil-tests', req.params.id);
});

// Check every booked test for a finished report
export const syncSoilTests = handle('Failed to sync soil reports', async () => {
  requireSoilPartner();
  return { result: await syncPendingSoilTests(200) };
});

export const getSoilTestSummary = handle('Failed to load soil test summary', async () => {
  const [total, booked, completed, noSample] = await Promise.all([
    SoilTest.countDocuments(),
    SoilTest.countDocuments({ status: 'booked' }),
    SoilTest.countDocuments({ status: 'completed' }),
    SoilTest.countDocuments({ sampleId: '' }),
  ]);
  return { summary: { total, booked, completed, noSample, partnerConfigured: soilConfigured() } };
});

/*
|--------------------------------------------------------------------------
| SCHEMES
|--------------------------------------------------------------------------
*/

export const getSchemeSummary = handle('Failed to load scheme summary', async () => {
  const docs = await Scheme.find().select('category isActive popular isNew translations translatedHash').lean();
  const active = docs.filter((d) => d.isActive);
  const byCategory = {};
  active.forEach((d) => { byCategory[d.category] = (byCategory[d.category] || 0) + 1; });
  return {
    summary: {
      total: docs.length,
      active: active.length,
      inactive: docs.length - active.length,
      popular: active.filter((d) => d.popular).length,
      new: active.filter((d) => d.isNew).length,
      translated: {
        hi: active.filter((d) => d.translations?.hi).length,
        mr: active.filter((d) => d.translations?.mr).length,
      },
      byCategory: Object.entries(byCategory).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    },
  };
});

// (Re)translate new / changed schemes now; ?force=1 redoes all
export const translateSchemesNow = handle('Failed to translate schemes', async (req) => {
  try {
    return { result: await translateSchemes({ force: req.query.force === '1' }) };
  } catch (error) {
    throw new AdminError(error.message || 'Translation failed.', 503);
  }
});
