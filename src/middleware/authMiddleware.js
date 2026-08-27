import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'Authorization token required' });
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ success: false, message: 'Invalid authorization format' });
    }

    const token = parts[1];

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    req.user = { userId: decoded.userId, email: decoded.email };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res
        .status(401)
        .json({ success: false, message: 'Access token expired', code: 'ACCESS_TOKEN_EXPIRED' });
    }

    return res.status(401).json({ success: false, message: 'Invalid access token' });
  }
};

export default authMiddleware;
