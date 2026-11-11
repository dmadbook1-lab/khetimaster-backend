import * as adminService from '../admin/adminService.js';
import { AdminError } from '../admin/adminService.js';
import { refreshArticles } from '../services/articleService.js';

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
