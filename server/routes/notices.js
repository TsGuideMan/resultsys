const express = require('express');
const router = express.Router();
const { query, querySingle, execute, insert } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const rows = await query(
      `SELECT n.*, u.full_name as created_by_name FROM notices n LEFT JOIN users u ON n.created_by=u.id ORDER BY n.created_at DESC`
    );
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const notice = await querySingle(
      `SELECT n.*, u.full_name as created_by_name FROM notices n LEFT JOIN users u ON n.created_by=u.id WHERE n.id=?`,
      [req.params.id]
    );
    if (!notice) return res.json({ success: false, error: 'Notice not found' });
    return res.json({ success: true, data: notice });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { title, content, file_name, file_data, file_type } = req.body;
    if (!title) return res.json({ success: false, error: 'Title is required' });
    const id = await insert(
      `INSERT INTO notices (title, content, file_name, file_data, file_type, created_by) VALUES (?,?,?,?,?,?)`,
      [title, content||'', file_name||'', file_data||null, file_type||'', req.user.id]
    );
    return res.json({ success: true, id, message: 'Notice created' });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { title, content, file_name, file_data, file_type } = req.body;
    const existing = await querySingle("SELECT * FROM notices WHERE id=?", [req.params.id]);
    if (!existing) return res.json({ success: false, error: 'Notice not found' });

    await execute(
      `UPDATE notices SET title=?, content=?, file_name=?, file_data=?, file_type=?, updated_at=datetime('now','localtime') WHERE id=?`,
      [title||existing.title, content!==undefined ? content : existing.content,
       file_name!==undefined ? file_name : existing.file_name,
       file_data!==undefined ? file_data : existing.file_data,
       file_type!==undefined ? file_type : existing.file_type,
       req.params.id]
    );
    return res.json({ success: true, message: 'Notice updated' });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await execute("DELETE FROM notices WHERE id=?", [req.params.id]);
    return res.json({ success: true, message: 'Notice deleted' });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

module.exports = router;
