const express = require('express');
const router = express.Router();
const { query, querySingle, execute, insert } = require('../db');
const { generateToken, verifyToken, authMiddleware } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await querySingle(
      `SELECT u.*, s.name as school_name FROM users u LEFT JOIN schools s ON u.school_id=s.id WHERE u.username=? LIMIT 1`,
      [username]
    );
    if (!user) return res.json({ success: false, error: 'Invalid username or password' });
    if (user.password_hash !== password) return res.json({ success: false, error: 'Invalid username or password' });
    if (!user.is_active) return res.json({ success: false, error: 'Account is deactivated' });

    await execute("UPDATE users SET last_login=datetime('now','localtime') WHERE id=?", [user.id]);

    const token = generateToken(user);
    return res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, school_id: user.school_id, full_name: user.full_name, school_name: user.school_name }
    });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/logout', (req, res) => {
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    const targetId = userId || req.user.id;
    const user = await querySingle("SELECT * FROM users WHERE id=?", [targetId]);
    if (!user) return res.json({ success: false, error: 'User not found' });
    if (user.password_hash !== currentPassword) return res.json({ success: false, error: 'Current password is incorrect' });
    await execute("UPDATE users SET password_hash=? WHERE id=?", [newPassword, targetId]);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/switch-school', authMiddleware, async (req, res) => {
  try {
    const { school_id } = req.body;
    if (req.user.role !== 'super_admin') return res.json({ success: false, error: 'Only super admin can switch school' });
    const school = await querySingle("SELECT * FROM schools WHERE id=?", [school_id]);
    if (!school) return res.json({ success: false, error: 'School not found' });

    const newToken = generateToken({ ...req.user, school_id: school.id });
    return res.json({ success: true, token: newToken, school });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/verify', (req, res) => {
  const { token } = req.query;
  const decoded = verifyToken(token);
  if (!decoded) return res.json({ success: false, error: 'Invalid token' });
  res.json({ success: true, user: decoded });
});

module.exports = router;
