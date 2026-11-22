const jwt = require('jsonwebtoken');
const config = require('../config');
const { ApiError } = require('../utils/helpers');

/**
 * Verifies the JWT. The token may arrive in the Authorization header or, for
 * Server-Sent Events and file downloads (which cannot set headers), in ?token=.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return next(new ApiError(401, 'Authentication required'));
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    return next(new ApiError(401, 'Session expired or invalid token. Please sign in again.'));
  }
}

const requireAdmin = (req, res, next) =>
  req.user && req.user.role === 'admin' ? next() : next(new ApiError(403, 'Administrator access required'));

module.exports = { authenticate, requireAdmin };
