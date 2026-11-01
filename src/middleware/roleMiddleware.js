import User from '../models/User.js';

/*
 * Allows the request only when the logged-in user has one of the roles.
 * Use after authMiddleware. The role is read from the database so a
 * promotion / demotion takes effect without a new token.
 */
const requireRole =
  (...roles) =>
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user?.userId).select('role').lean();

      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      req.user.role = user.role;

      next();
    } catch (error) {
      console.error('Role check error:', error);

      return res.status(500).json({ success: false, message: 'Failed to verify access' });
    }
  };

export const requireAdmin = requireRole('admin');

export default requireRole;
