const express = require('express');
const router = express.Router();
const { query, querySingle, execute, insert } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM schools ORDER BY name ASC");
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const school = await querySingle("SELECT * FROM schools WHERE id=?", [req.params.id]);
    if (!school) return res.json({ success: false, error: 'School not found' });
    return res.json({ success: true, data: school });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const d = req.body;
    const id = await insert(
      `INSERT INTO schools (name, municipality, district, province, estd, iemis_id, phone, email,
        head_teacher, school_logo, watermark_text, watermark_color, watermark_font_size, watermark_repeat, watermark_line_height)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.name, d.municipality||'', d.district||'', d.province||'', d.estd||'', d.iemis_id||'', d.phone||'',
       d.email||'', d.head_teacher||'', d.school_logo||null, d.watermark_text||null, d.watermark_color||'#1a3a5c',
       d.watermark_font_size||10, d.watermark_repeat||200, d.watermark_line_height||2.4]
    );
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const d = req.body;
    await execute(
      `UPDATE schools SET name=?, municipality=?, district=?, province=?, estd=?, iemis_id=?, phone=?, email=?,
        head_teacher=?, school_logo=?, watermark_text=?, watermark_color=?, watermark_font_size=?, watermark_repeat=?, watermark_line_height=?
       WHERE id=?`,
      [d.name, d.municipality||'', d.district||'', d.province||'', d.estd||'', d.iemis_id||'', d.phone||'',
       d.email||'', d.head_teacher||'', d.school_logo||null, d.watermark_text||null, d.watermark_color||'#1a3a5c',
       d.watermark_font_size||10, d.watermark_repeat||200, d.watermark_line_height||2.4, req.params.id]
    );
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await execute("DELETE FROM schools WHERE id=?", [req.params.id]);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/:id/approve', authMiddleware, adminOnly, async (req, res) => {
  try {
    await execute("UPDATE schools SET is_approved=1 WHERE id=?", [req.params.id]);
    // Also activate the school admin user
    await execute("UPDATE users SET is_active=1 WHERE school_id=? AND role='school_admin'", [req.params.id]);
    return res.json({ success: true, message: 'School approved successfully' });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/:id/reject', authMiddleware, adminOnly, async (req, res) => {
  try {
    await execute("UPDATE schools SET is_approved=-1 WHERE id=?", [req.params.id]);
    // Deactivate the school admin user
    await execute("UPDATE users SET is_active=0 WHERE school_id=? AND role='school_admin'", [req.params.id]);
    return res.json({ success: true, message: 'School rejected' });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

module.exports = router;
