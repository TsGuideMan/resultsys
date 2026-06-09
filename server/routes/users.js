const express = require('express');
const router = express.Router();
const { query, querySingle, execute, insert } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const schoolId = req.query.school_id || null;
    if (schoolId) {
      const rows = await query(
        "SELECT u.*, s.name as school_name FROM users u LEFT JOIN schools s ON u.school_id=s.id WHERE u.school_id=? ORDER BY u.full_name ASC",
        [parseInt(schoolId)]
      );
      return res.json({ success: true, data: rows });
    }
    const rows = await query("SELECT u.*, s.name as school_name FROM users u LEFT JOIN schools s ON u.school_id=s.id ORDER BY u.full_name ASC");
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const d = req.body;
    const exists = await querySingle("SELECT id FROM users WHERE username=?", [d.username]);
    if (exists) return res.json({ success: false, error: 'Username already exists' });
    const id = await insert(
      `INSERT INTO users (username, password_hash, full_name, email, phone, role, school_id, is_active)
       VALUES (?,?,?,?,?,?,?,?)`,
      [d.username, d.password, d.full_name||'', d.email||'', d.phone||'',
       d.role||'school_admin', d.school_id||null, d.is_active !== undefined ? d.is_active : 1]
    );
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const d = req.body;
    await execute(
      `UPDATE users SET full_name=?, email=?, phone=?, role=?, school_id=?, is_active=? WHERE id=?`,
      [d.full_name||'', d.email||'', d.phone||'', d.role||'school_admin', d.school_id||null, d.is_active !== undefined ? d.is_active : 1, req.params.id]
    );
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await execute("DELETE FROM users WHERE id=?", [req.params.id]);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

module.exports = router;
