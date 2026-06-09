const jwt = require('jsonwebtoken');
const { querySingle } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'result-management-system-secret-key-2024';

function generateToken(user) {
  return jwt.sign({
    id: user.id,
    username: user.username,
    role: user.role,
    school_id: user.school_id,
    full_name: user.full_name
  }, JWT_SECRET, { expiresIn: '24h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }
  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  req.user = decoded;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Super admin only' });
  }
  next();
}

function getSchoolId(req) {
  if (req.user.role === 'super_admin') {
    return req.query.school_id ? parseInt(req.query.school_id) : null;
  }
  return req.user.school_id;
}

module.exports = { generateToken, verifyToken, authMiddleware, adminOnly, getSchoolId, JWT_SECRET };
