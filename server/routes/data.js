const express = require('express');
const router = express.Router();
const { query, querySingle, execute, insert } = require('../db');
const { authMiddleware, getSchoolId } = require('../middleware/auth');

function scrId(req) {
  const sid = getSchoolId(req);
  return sid;
}
function schoolFilter(req, alias) {
  const sid = scrId(req);
  const a = alias ? `${alias}.` : '';
  return sid ? ` AND ${a}school_id=?` : '';
}
function schoolFilterParams(req) {
  const sid = scrId(req);
  return sid ? [sid] : [];
}

// ─── Dashboard ───
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const sf = schoolFilter(req);
    const sp = schoolFilterParams(req);
    const schools = await query("SELECT COUNT(*) as cnt FROM schools");
    const students = await query(`SELECT COUNT(*) as cnt FROM students WHERE 1=1${sf}`, sp);
    const teachers = await query(`SELECT COUNT(*) as cnt FROM teachers WHERE 1=1${sf}`, sp);
    const staff = await query(`SELECT COUNT(*) as cnt FROM staff WHERE 1=1${sf}`, sp);
    const users = await query("SELECT COUNT(*) as cnt FROM users");
    const male = await query(`SELECT COUNT(*) as cnt FROM students WHERE gender='Male'${sf}`, sp);
    const female = await query(`SELECT COUNT(*) as cnt FROM students WHERE gender='Female'${sf}`, sp);
    const classDist = await query(`SELECT class, COUNT(*) as cnt FROM students WHERE 1=1${sf} GROUP BY class ORDER BY class`, sp);
    const recentSf = schoolFilter(req, 's');
    const recentSp = schoolFilterParams(req);
    const recent = await query(`SELECT s.*, sc.name as school_name FROM students s LEFT JOIN schools sc ON s.school_id=sc.id WHERE 1=1${recentSf} ORDER BY s.id DESC LIMIT 10`, recentSp);
    const attSf = schoolFilter(req, 'a');
    const attSp = schoolFilterParams(req);
    const attToday = await query(`SELECT COUNT(*) as cnt FROM attendance a WHERE a.date=date('now')${attSf} AND a.status='Present'`, attSp);
    return res.json({ success: true, data: {
      total_schools: schools[0]?.cnt || 0,
      total_students: students[0]?.cnt || 0,
      total_teachers: teachers[0]?.cnt || 0,
      total_staff: staff[0]?.cnt || 0,
      total_users: users[0]?.cnt || 0,
      male_students: male[0]?.cnt || 0,
      female_students: female[0]?.cnt || 0,
      class_distribution: classDist,
      recent_students: recent,
      present_today: attToday[0]?.cnt || 0
    }});
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Students ───
router.get('/students', authMiddleware, async (req, res) => {
  try {
    const q = req.query;
    let sql = "SELECT s.*, sc.name as school_name FROM students s LEFT JOIN schools sc ON s.school_id=sc.id WHERE 1=1";
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND s.school_id=?"; params.push(sid); }
    if (q.class) { sql += " AND s.class=?"; params.push(q.class); }
    if (q.faculty) { sql += " AND s.faculty=?"; params.push(q.faculty); }
    if (q.session) { sql += " AND s.session=?"; params.push(q.session); }
    if (q.search) { sql += " AND (s.name LIKE ? OR s.roll_no LIKE ? OR s.sym LIKE ? OR s.reg LIKE ?)"; params.push(`%${q.search}%`,`%${q.search}%`,`%${q.search}%`,`%${q.search}%`); }
    if (q.student_id) { sql += " AND s.id=?"; params.push(q.student_id); }
    sql += " ORDER BY s.class ASC, s.faculty ASC, CAST(s.roll_no AS INTEGER) ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/students/:id', authMiddleware, async (req, res) => {
  try {
    const row = await querySingle("SELECT s.*, sc.name as school_name FROM students s LEFT JOIN schools sc ON s.school_id=sc.id WHERE s.id=?", [req.params.id]);
    if (!row) return res.json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: row });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/students', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const id = await insert(
      `INSERT INTO students (name, roll_no, sym, reg, class, faculty, session, gender, dob, dob_bs,
        father_name, mother_name, guardian_name, address, phone, photo_path, school_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.name, d.roll_no, d.sym||'', d.reg||'', d.class, d.faculty, d.session, d.gender||'', d.dob||'',
       d.dob_bs||'', d.father_name||'', d.mother_name||'', d.guardian_name||'', d.address||'', d.phone||'',
       d.photo_path||null, scrId(req)]
    );
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/students/:id', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    await execute(
      `UPDATE students SET name=?, roll_no=?, sym=?, reg=?, class=?, faculty=?, session=?, gender=?, dob=?, dob_bs=?,
        father_name=?, mother_name=?, guardian_name=?, address=?, phone=?, photo_path=? WHERE id=?`,
      [d.name, d.roll_no, d.sym||'', d.reg||'', d.class, d.faculty, d.session, d.gender||'', d.dob||'',
       d.dob_bs||'', d.father_name||'', d.mother_name||'', d.guardian_name||'', d.address||'', d.phone||'',
       d.photo_path||null, req.params.id]
    );
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/students/:id', authMiddleware, async (req, res) => {
  try { await execute("DELETE FROM students WHERE id=?", [req.params.id]); return res.json({ success: true }); }
  catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/students/delete-multiple', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json({ success: false, error: 'No IDs' });
    const ph = ids.map(() => '?').join(',');
    await execute(`DELETE FROM students WHERE id IN (${ph})`, ids);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Subjects ───
router.get('/subjects', authMiddleware, async (req, res) => {
  try {
    const q = req.query;
    let sql = "SELECT * FROM subjects WHERE 1=1";
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND school_id=?"; params.push(sid); }
    if (q.class) { sql += " AND class=?"; params.push(q.class); }
    if (q.faculty) { sql += " AND faculty=?"; params.push(q.faculty); }
    if (q.search) { sql += " AND (name LIKE ? OR code LIKE ?)"; params.push(`%${q.search}%`,`%${q.search}%`); }
    sql += " ORDER BY display_seq ASC, name ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/subjects/:id', authMiddleware, async (req, res) => {
  try {
    const row = await querySingle("SELECT * FROM subjects WHERE id=?", [req.params.id]);
    if (!row) return res.json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: row });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/subjects', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const id = await insert(
      `INSERT INTO subjects (name, code, class, faculty, full_marks_theory, full_marks_practical,
        pass_marks_theory, pass_marks_practical, credit_hours, is_compulsory, credit_th, credit_in,
        display_seq, term1_full_marks, term1_pass_marks, term1_credit_hours,
        term2_full_marks, term2_pass_marks, term2_credit_hours, school_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.name, d.code, d.class, d.faculty||'General', d.full_marks_theory, d.full_marks_practical,
       d.pass_marks_theory, d.pass_marks_practical, d.credit_hours,
       d.is_compulsory !== undefined ? d.is_compulsory : 1,
       d.credit_th, d.credit_in, d.display_seq||0,
       d.term1_full_marks||0, d.term1_pass_marks||0, d.term1_credit_hours||0,
       d.term2_full_marks||0, d.term2_pass_marks||0, d.term2_credit_hours||0, scrId(req)]
    );
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/subjects/:id', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    await execute(
      `UPDATE subjects SET name=?, code=?, class=?, faculty=?, full_marks_theory=?, full_marks_practical=?,
        pass_marks_theory=?, pass_marks_practical=?, credit_hours=?, is_compulsory=?, credit_th=?, credit_in=?,
        display_seq=?, term1_full_marks=?, term1_pass_marks=?, term1_credit_hours=?,
        term2_full_marks=?, term2_pass_marks=?, term2_credit_hours=? WHERE id=?`,
      [d.name, d.code, d.class, d.faculty||'General', d.full_marks_theory, d.full_marks_practical,
       d.pass_marks_theory, d.pass_marks_practical, d.credit_hours, d.is_compulsory,
       d.credit_th, d.credit_in, d.display_seq||0,
       d.term1_full_marks||0, d.term1_pass_marks||0, d.term1_credit_hours||0,
       d.term2_full_marks||0, d.term2_pass_marks||0, d.term2_credit_hours||0, req.params.id]
    );
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/subjects/:id', authMiddleware, async (req, res) => {
  try { await execute("DELETE FROM subjects WHERE id=?", [req.params.id]); return res.json({ success: true }); }
  catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/subjects/delete-multiple', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json({ success: false, error: 'No IDs' });
    const ph = ids.map(() => '?').join(',');
    await execute(`DELETE FROM subjects WHERE id IN (${ph})`, ids);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Teachers ───
router.get('/teachers', authMiddleware, async (req, res) => {
  try {
    let sql = "SELECT * FROM teachers WHERE 1=1";
    const params = schoolFilterParams(req);
    sql += schoolFilter(req);
    if (req.query.search) { sql += " AND name LIKE ?"; params.push(`%${req.query.search}%`); }
    sql += " ORDER BY name ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/teachers/:id', authMiddleware, async (req, res) => {
  try {
    const row = await querySingle("SELECT * FROM teachers WHERE id=?", [req.params.id]);
    if (!row) return res.json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: row });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/teachers', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const id = await insert(
      `INSERT INTO teachers (name, dob, qualification, subject, phone, email, address, gender, join_date, salary, photo_path, school_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.name, d.dob||'', d.qualification||'', d.subject||'', d.phone||'', d.email||'', d.address||'',
       d.gender||'', d.join_date||'', d.salary||0, d.photo_path||null, scrId(req)]
    );
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/teachers/:id', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    await execute(
      `UPDATE teachers SET name=?, dob=?, qualification=?, subject=?, phone=?, email=?, address=?, gender=?, join_date=?, salary=?, photo_path=? WHERE id=?`,
      [d.name, d.dob||'', d.qualification||'', d.subject||'', d.phone||'', d.email||'', d.address||'',
       d.gender||'', d.join_date||'', d.salary||0, d.photo_path||null, req.params.id]
    );
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/teachers/:id', authMiddleware, async (req, res) => {
  try { await execute("DELETE FROM teachers WHERE id=?", [req.params.id]); return res.json({ success: true }); }
  catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/teachers/delete-multiple', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json({ success: false, error: 'No IDs' });
    const ph = ids.map(() => '?').join(',');
    await execute(`DELETE FROM teachers WHERE id IN (${ph})`, ids);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Staff ───
router.get('/staff', authMiddleware, async (req, res) => {
  try {
    let sql = "SELECT * FROM staff WHERE 1=1";
    const params = schoolFilterParams(req);
    sql += schoolFilter(req);
    if (req.query.search) { sql += " AND name LIKE ?"; params.push(`%${req.query.search}%`); }
    sql += " ORDER BY name ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/staff/:id', authMiddleware, async (req, res) => {
  try {
    const row = await querySingle("SELECT * FROM staff WHERE id=?", [req.params.id]);
    if (!row) return res.json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: row });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/staff', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const id = await insert(
      `INSERT INTO staff (name, dob, designation, phone, email, address, gender, join_date, salary, photo_path, school_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [d.name, d.dob||'', d.designation||'', d.phone||'', d.email||'', d.address||'',
       d.gender||'', d.join_date||'', d.salary||0, d.photo_path||null, scrId(req)]
    );
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/staff/:id', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    await execute(
      `UPDATE staff SET name=?, dob=?, designation=?, phone=?, email=?, address=?, gender=?, join_date=?, salary=?, photo_path=? WHERE id=?`,
      [d.name, d.dob||'', d.designation||'', d.phone||'', d.email||'', d.address||'',
       d.gender||'', d.join_date||'', d.salary||0, d.photo_path||null, req.params.id]
    );
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/staff/:id', authMiddleware, async (req, res) => {
  try { await execute("DELETE FROM staff WHERE id=?", [req.params.id]); return res.json({ success: true }); }
  catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/staff/delete-multiple', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json({ success: false, error: 'No IDs' });
    const ph = ids.map(() => '?').join(',');
    await execute(`DELETE FROM staff WHERE id IN (${ph})`, ids);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Attendance ───
router.post('/attendance', authMiddleware, async (req, res) => {
  try {
    const { records } = req.body;
    if (!records || !records.length) return res.json({ success: false, error: 'No records' });
    const sid = scrId(req);
    for (const row of records) {
      await execute(
        `INSERT OR REPLACE INTO attendance (person_type, person_id, date, status, remarks, school_id)
         VALUES (?,?,?,?,?,?)`,
        [row.person_type, row.person_id, row.date, row.status, row.remarks||null, sid]
      );
    }
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/attendance', authMiddleware, async (req, res) => {
  try {
    const q = req.query;
    let sql = "SELECT a.*, t.name as person_name FROM attendance a LEFT JOIN teachers t ON a.person_type='teacher' AND a.person_id=t.id WHERE 1=1";
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND a.school_id=?"; params.push(sid); }
    if (q.person_type) { sql += " AND a.person_type=?"; params.push(q.person_type); }
    if (q.date) { sql += " AND a.date=?"; params.push(q.date); }
    if (q.from && q.to) { sql += " AND a.date BETWEEN ? AND ?"; params.push(q.from, q.to); }
    sql += " ORDER BY a.date DESC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/attendance-stats', authMiddleware, async (req, res) => {
  try {
    const { student_id, session } = req.query;
    const sid = scrId(req);
    const schoolParams = [];
    let schoolSql = "SELECT COUNT(DISTINCT date) as cnt FROM attendance WHERE person_type='teacher'";
    if (sid) { schoolSql += " AND school_id=?"; schoolParams.push(sid); }
    const schoolResult = await query(schoolSql, schoolParams);
    const schoolOpenDays = schoolResult[0]?.cnt || 0;

    const studParams = [student_id];
    let studSql = "SELECT COUNT(*) as cnt FROM attendance WHERE person_type='student' AND person_id=? AND status='Present'";
    if (sid) { studSql += " AND school_id=?"; studParams.push(sid); }
    const studResult = await query(studSql, studParams);
    const presentDays = studResult[0]?.cnt || 0;

    return res.json({ success: true, data: { schoolOpenDays, presentDays, percentage: schoolOpenDays > 0 ? Math.round((presentDays/schoolOpenDays)*100) : 0 } });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Sections ───
router.get('/sections', authMiddleware, async (req, res) => {
  try {
    let sql = "SELECT * FROM sections WHERE 1=1";
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND school_id=?"; params.push(sid); }
    if (req.query.class) { sql += " AND class=?"; params.push(req.query.class); }
    sql += " ORDER BY class ASC, name ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/sections', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const id = await insert("INSERT INTO sections (class, name, class_teacher_id, school_id) VALUES (?,?,?,?)",
      [d.class, d.name, d.class_teacher_id||null, scrId(req)]);
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/sections/:id', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    await execute("UPDATE sections SET name=?, class_teacher_id=? WHERE id=?",
      [d.name, d.class_teacher_id||null, req.params.id]);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/sections/:id', authMiddleware, async (req, res) => {
  try { await execute("DELETE FROM sections WHERE id=?", [req.params.id]); return res.json({ success: true }); }
  catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Routines ───
router.get('/routines', authMiddleware, async (req, res) => {
  try {
    let sql = "SELECT r.*, t.name as teacher_name FROM routines r LEFT JOIN teachers t ON r.teacher_id=t.id WHERE 1=1";
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND r.school_id=?"; params.push(sid); }
    if (req.query.class) { sql += " AND r.class=?"; params.push(req.query.class); }
    if (req.query.section) { sql += " AND r.section=?"; params.push(req.query.section); }
    if (req.query.day) { sql += " AND r.day=?"; params.push(req.query.day); }
    sql += " ORDER BY r.day ASC, r.period ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/routines', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const sid = scrId(req);
    await execute("DELETE FROM routines WHERE class=? AND section=? AND school_id=?", [d.class, d.section||'', sid]);
    if (d.periods && d.periods.length) {
      for (const p of d.periods) {
        await execute(
          "INSERT INTO routines (class, section, day, period, subject, teacher_id, school_id) VALUES (?,?,?,?,?,?,?)",
          [d.class, d.section||'', p.day, p.period, p.subject, p.teacher_id||null, sid]
        );
      }
    }
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Fee Setup ───
router.get('/fee-items', authMiddleware, async (req, res) => {
  try {
    let sql = "SELECT * FROM fee_setup WHERE 1=1";
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND school_id=?"; params.push(sid); }
    if (req.query.class) { sql += " AND class=?"; params.push(req.query.class); }
    if (req.query.session) { sql += " AND session=?"; params.push(req.query.session); }
    sql += " ORDER BY name ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/fee-items', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const id = await insert("INSERT INTO fee_setup (name, amount, class, faculty, session, school_id) VALUES (?,?,?,?,?,?)",
      [d.name, d.amount, d.class||'', d.faculty||'', d.session, scrId(req)]);
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/fee-items/:id', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    await execute("UPDATE fee_setup SET name=?, amount=?, class=?, faculty=? WHERE id=?",
      [d.name, d.amount, d.class||'', d.faculty||'', req.params.id]);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/fee-items/:id', authMiddleware, async (req, res) => {
  try { await execute("DELETE FROM fee_setup WHERE id=?", [req.params.id]); return res.json({ success: true }); }
  catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Fee Collections ───
router.get('/fee-collections', authMiddleware, async (req, res) => {
  try {
    let sql = "SELECT fc.*, s.name as student_name, s.class, s.faculty, s.roll_no FROM fee_collections fc JOIN students s ON fc.student_id=s.id WHERE 1=1";
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND fc.school_id=?"; params.push(sid); }
    if (req.query.student_id) { sql += " AND fc.student_id=?"; params.push(req.query.student_id); }
    if (req.query.session) { sql += " AND fc.session=?"; params.push(req.query.session); }
    sql += " ORDER BY fc.date DESC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/fee-collections', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const sid = scrId(req);
    const collId = await insert(
      "INSERT INTO fee_collections (student_id, session, total_amount, paid_amount, discount, payment_method, remarks, date, school_id) VALUES (?,?,?,?,?,?,?,?,?)",
      [d.student_id, d.session, d.total_amount, d.paid_amount, d.discount||0, d.payment_method||'Cash', d.remarks||'', d.date, sid]);
    if (d.items && d.items.length) {
      for (const item of d.items) {
        await insert("INSERT INTO fee_collection_items (collection_id, fee_item_id, fee_name, amount) VALUES (?,?,?,?)",
          [collId, item.fee_item_id||null, item.fee_name, item.amount]);
      }
    }
    return res.json({ success: true, id: collId });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/fee-collections/:id/items', authMiddleware, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM fee_collection_items WHERE collection_id=?", [req.params.id]);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/fee-collections/:id', authMiddleware, async (req, res) => {
  try { await execute("DELETE FROM fee_collections WHERE id=?", [req.params.id]); return res.json({ success: true }); }
  catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Books ───
router.get('/books', authMiddleware, async (req, res) => {
  try {
    let sql = "SELECT * FROM books WHERE 1=1";
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND school_id=?"; params.push(sid); }
    if (req.query.search) { sql += " AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)"; params.push(`%${req.query.search}%`,`%${req.query.search}%`,`%${req.query.search}%`); }
    sql += " ORDER BY title ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/books/:id', authMiddleware, async (req, res) => {
  try {
    const row = await querySingle("SELECT * FROM books WHERE id=?", [req.params.id]);
    if (!row) return res.json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: row });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/books', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const qty = parseInt(d.quantity) || 1;
    const id = await insert(
      "INSERT INTO books (title, author, publisher, isbn, category, quantity, available_quantity, rack_no, description, school_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [d.title, d.author||'', d.publisher||'', d.isbn||'', d.category||'', qty, qty, d.rack_no||'', d.description||'', scrId(req)]);
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.delete('/books/:id', authMiddleware, async (req, res) => {
  try { await execute("DELETE FROM books WHERE id=?", [req.params.id]); return res.json({ success: true }); }
  catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Book Issues ───
router.get('/book-issues', authMiddleware, async (req, res) => {
  try {
    let sql = `SELECT bi.*, b.title as book_title, s.name as student_name, s.class, s.roll_no
      FROM book_issues bi JOIN books b ON bi.book_id=b.id JOIN students s ON bi.student_id=s.id WHERE 1=1`;
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND bi.school_id=?"; params.push(sid); }
    if (req.query.status) { sql += " AND bi.status=?"; params.push(req.query.status); }
    sql += " ORDER BY bi.issue_date DESC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/book-issues', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const id = await insert(
      "INSERT INTO book_issues (book_id, student_id, issue_date, due_date, remarks, school_id) VALUES (?,?,?,?,?,?)",
      [d.book_id, d.student_id, d.issue_date, d.due_date, d.remarks||'', scrId(req)]);
    await execute("UPDATE books SET available_quantity = available_quantity - 1 WHERE id=? AND available_quantity > 0", [d.book_id]);
    return res.json({ success: true, id });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.put('/book-issues/:id/return', authMiddleware, async (req, res) => {
  try {
    const { return_date } = req.body;
    await execute("UPDATE book_issues SET return_date=?, status='returned' WHERE id=? AND status='issued'", [return_date, req.params.id]);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Subject Registrations ───
router.get('/subject-registrations', authMiddleware, async (req, res) => {
  try {
    let sql = `SELECT sr.*, sub.name as subject_name, sub.code as subject_code, sub.is_compulsory
      FROM subject_registrations sr JOIN subjects sub ON sr.subject_id=sub.id WHERE 1=1`;
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND sr.school_id=?"; params.push(sid); }
    if (req.query.student_id) { sql += " AND sr.student_id=?"; params.push(req.query.student_id); }
    if (req.query.session) { sql += " AND sr.session=?"; params.push(req.query.session); }
    sql += " ORDER BY sub.is_compulsory DESC, sub.display_seq ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/subject-registrations', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const sid = scrId(req);
    await execute("DELETE FROM subject_registrations WHERE student_id=? AND session=?", [d.student_id, d.session]);
    if (d.subject_ids && d.subject_ids.length) {
      for (const subId of d.subject_ids) {
        await execute("INSERT INTO subject_registrations (student_id, subject_id, session, school_id) VALUES (?,?,?,?)",
          [d.student_id, subId, d.session, sid]);
      }
    }
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/subject-registrations/bulk', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const sid = scrId(req);
    const { student_ids, subject_ids, session } = d;
    if (!student_ids || !student_ids.length || !subject_ids || !subject_ids.length) {
      return res.json({ success: false, error: 'Missing student or subject IDs' });
    }
    for (const sId of student_ids) {
      for (const subId of subject_ids) {
        try {
          await execute("INSERT OR IGNORE INTO subject_registrations (student_id, subject_id, session, school_id) VALUES (?,?,?,?)",
            [sId, subId, session, sid]);
        } catch (ignored) {}
      }
    }
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Marks ───
function calcGrade(marks, fullMarks, passMarks) {
  const m = parseFloat(marks) || 0;
  const fm = parseFloat(fullMarks) || 0;
  const pm = parseFloat(passMarks) || 0;
  if (m < pm || fm === 0) return { grade: 'NG', gp: 0 };
  const pct = (m / fm) * 100;
  if (pct >= 90) return { grade: 'A+', gp: 4.0 };
  if (pct >= 80) return { grade: 'A', gp: 3.6 };
  if (pct >= 70) return { grade: 'B+', gp: 3.2 };
  if (pct >= 60) return { grade: 'B', gp: 2.8 };
  if (pct >= 50) return { grade: 'C+', gp: 2.4 };
  if (pct >= 40) return { grade: 'C', gp: 2.0 };
  if (pct >= 35) return { grade: 'D+', gp: 1.6 };
  return { grade: 'NG', gp: 0 };
}

router.post('/marks', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const sid = scrId(req);
    const sub = await querySingle("SELECT * FROM subjects WHERE id=?", [d.subject_id]);
    if (!sub) return res.json({ success: false, error: 'Subject not found' });

    const isTerm = d.exam_type === 'term1' || d.exam_type === 'term2';
    const examType = d.exam_type || 'final';
    const tFmKey = isTerm ? `${d.exam_type}_full_marks` : 'full_marks_theory';
    const tPmKey = isTerm ? `${d.exam_type}_pass_marks` : 'pass_marks_theory';
    const tMax = parseFloat(sub[tFmKey]) || parseFloat(sub.full_marks_theory) || 0;
    const tPm = parseFloat(sub[tPmKey]) || parseFloat(sub.pass_marks_theory) || 0;
    const pMax = isTerm ? 0 : (parseFloat(sub.full_marks_practical) || 0);
    const pPm = isTerm ? 0 : (parseFloat(sub.pass_marks_practical) || 0);

    const theoryRes = calcGrade(d.theory_marks, tMax, tPm);
    const practicalRes = calcGrade(d.practical_marks, pMax, pPm);
    const combinedGp = isTerm ? theoryRes.gp : ((theoryRes.gp + practicalRes.gp) / 2);
    const combinedGrade = isTerm ? theoryRes.grade : (
      combinedGp >= 3.6 ? 'A+' : combinedGp >= 3.2 ? 'A' : combinedGp >= 2.8 ? 'B+' :
      combinedGp >= 2.4 ? 'B' : combinedGp >= 2.0 ? 'C+' : combinedGp >= 1.6 ? 'C' :
      combinedGp >= 1.2 ? 'D+' : 'NG');

    await execute(
      `INSERT OR REPLACE INTO marks (student_id, subject_id, exam_type, theory_marks, practical_marks, grade_point, grade, theory_grade, theory_grade_point, practical_grade, practical_grade_point, session, school_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.student_id, d.subject_id, examType, d.theory_marks||0, d.practical_marks||0, combinedGp, combinedGrade,
       theoryRes.grade, theoryRes.gp, practicalRes.grade, practicalRes.gp, d.session, sid]
    );
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/marks', authMiddleware, async (req, res) => {
  try {
    const q = req.query;
    let sql = `SELECT m.*, sub.name as subject_name, sub.code as subject_code, sub.class as subject_class, sub.faculty as subject_faculty,
      sub.full_marks_theory, sub.full_marks_practical, sub.pass_marks_theory, sub.pass_marks_practical,
      sub.credit_hours, sub.is_compulsory, sub.credit_th, sub.credit_in,
      sub.term1_full_marks, sub.term1_pass_marks, sub.term1_credit_hours,
      sub.term2_full_marks, sub.term2_pass_marks, sub.term2_credit_hours,
      sub.display_seq
      FROM marks m JOIN subjects sub ON m.subject_id=sub.id WHERE 1=1`;
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND m.school_id=?"; params.push(sid); }
    if (q.student_id) { sql += " AND m.student_id=?"; params.push(q.student_id); }
    if (q.subject_id) { sql += " AND m.subject_id=?"; params.push(q.subject_id); }
    if (q.exam_type) { sql += " AND m.exam_type=?"; params.push(q.exam_type); }
    if (q.session) { sql += " AND m.session=?"; params.push(q.session); }
    sql += " ORDER BY sub.display_seq ASC, sub.name ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Results ───
router.post('/results/process', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    const { student_id, session, exam_type } = d;
    const sid = scrId(req);
    const student = await querySingle("SELECT * FROM students WHERE id=?", [student_id]);
    if (!student) return res.json({ success: false, error: 'Student not found' });

    const marksSql = sid
      ? "SELECT m.*, sub.* FROM marks m JOIN subjects sub ON m.subject_id=sub.id WHERE m.student_id=? AND m.session=? AND m.exam_type=? AND m.school_id=?"
      : "SELECT m.*, sub.* FROM marks m JOIN subjects sub ON m.subject_id=sub.id WHERE m.student_id=? AND m.session=? AND m.exam_type=?";
    const marksParams = sid ? [student_id, session, exam_type||'final', sid] : [student_id, session, exam_type||'final'];
    const marksList = await query(marksSql, marksParams);
    if (!marksList.length) return res.json({ success: false, error: 'No marks found for this student' });

    const isTerm = exam_type === 'term1' || exam_type === 'term2';
    let totalTheory = 0, totalPractical = 0, totalCH = 0, weightedGP = 0, hasFail = false;

    for (const m of marksList) {
      const t = parseFloat(m.theory_marks) || 0;
      const p = parseFloat(m.practical_marks) || 0;
      totalTheory += t;
      totalPractical += p;
      const chKey = isTerm ? `${exam_type}_credit_hours` : 'credit_hours';
      const ch = parseFloat(m[chKey]) || 1;
      totalCH += ch;
      const gpKey = isTerm ? 'theory_grade_point' : 'grade_point';
      const gp = parseFloat(m[gpKey]) || 0;
      weightedGP += gp * ch;
      const gKey = isTerm ? 'theory_grade' : 'grade';
      const g = m[gKey] || 'NG';
      if (g === 'NG' || g === 'E') hasFail = true;
    }

    const gpa = totalCH > 0 ? parseFloat((weightedGP / totalCH).toFixed(2)) : 0;
    const grade = gpa >= 3.6 ? 'A+' : gpa >= 3.2 ? 'A' : gpa >= 2.8 ? 'B+' : gpa >= 2.4 ? 'B' : gpa >= 2.0 ? 'C+' : gpa >= 1.6 ? 'C' : gpa >= 1.2 ? 'D+' : 'NG';
    const status = hasFail ? 'Supplementary' : (gpa >= 1.6 ? 'Pass' : 'Supplementary');
    const grandTotal = totalTheory + totalPractical;

    const et = exam_type || 'final';
    await execute(
      `INSERT OR REPLACE INTO results (student_id, session, class, faculty, exam_type, total_theory, total_practical, grand_total,
        total_credit_hours, weighted_grade_points, gpa, grade, status, rank, school_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [student_id, session, student.class, student.faculty, et,
       totalTheory, totalPractical, grandTotal, totalCH, weightedGP, gpa, grade, status, null, sid]
    );

    // Rank
    const allRes = await query(
      `SELECT id FROM results WHERE session=? AND class=? AND faculty=? AND exam_type=? AND status='Pass'
       ORDER BY gpa DESC, grand_total DESC`,
      [session, student.class, student.faculty, et]
    );
    for (let i = 0; i < allRes.length; i++) {
      await execute("UPDATE results SET rank=? WHERE id=?", [i + 1, allRes[i].id]);
    }

    return res.json({ success: true, data: { gpa, grade, status } });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/results', authMiddleware, async (req, res) => {
  try {
    const q = req.query;
    let sql = `SELECT r.*, s.name as student_name, s.roll_no, s.sym, s.reg, s.photo_path
      FROM results r JOIN students s ON r.student_id=s.id WHERE 1=1`;
    const params = [];
    const sid = scrId(req);
    if (sid) { sql += " AND r.school_id=?"; params.push(sid); }
    if (q.student_id) { sql += " AND r.student_id=?"; params.push(q.student_id); }
    if (q.session) { sql += " AND r.session=?"; params.push(q.session); }
    if (q.class) { sql += " AND r.class=?"; params.push(q.class); }
    if (q.faculty) { sql += " AND r.faculty=?"; params.push(q.faculty); }
    if (q.exam_type) { sql += " AND r.exam_type=?"; params.push(q.exam_type); }
    sql += " ORDER BY r.rank ASC";
    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Settings ───
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM settings");
    const data = {};
    rows.forEach(r => data[r.key] = r.value);
    return res.json({ success: true, data });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.get('/settings/:key', authMiddleware, async (req, res) => {
  try {
    const row = await querySingle("SELECT * FROM settings WHERE key=?", [req.params.key]);
    return res.json({ success: true, data: row ? row.value : null });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/settings', authMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;
    await execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)", [key, String(value)]);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Logo ───
router.post('/logo', authMiddleware, async (req, res) => {
  try {
    const { base64 } = req.body;
    await execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('school_logo', ?)", [base64]);
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Export / Import ───
router.get('/export', authMiddleware, async (req, res) => {
  try {
    const sid = scrId(req);
    const tables = ['students', 'subjects', 'teachers', 'staff', 'subject_registrations', 'marks', 'results'];
    const result = {};
    for (const t of tables) {
      result[t] = sid ? await query(`SELECT * FROM ${t} WHERE school_id=?`, [sid]) : await query(`SELECT * FROM ${t}`);
    }
    result.settings = await query("SELECT * FROM settings");
    return res.json({ success: true, data: result });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

router.post('/import', authMiddleware, async (req, res) => {
  try {
    const { data } = req.body;
    const sid = scrId(req);
    if (data.students && sid) {
      for (const row of data.students) {
        await execute(`INSERT OR REPLACE INTO students (id, name, roll_no, class, faculty, session, gender, dob, father_name, mother_name, guardian_name, address, phone, photo_path, school_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [row.id, row.name, row.roll_no, row.class, row.faculty, row.session, row.gender||'', row.dob||'', row.father_name||'', row.mother_name||'', row.guardian_name||'', row.address||'', row.phone||'', row.photo_path||null, sid]);
      }
    }
    if (data.subjects && sid) {
      for (const row of data.subjects) {
        await execute(`INSERT OR REPLACE INTO subjects (id, name, code, class, faculty, full_marks_theory, full_marks_practical, pass_marks_theory, pass_marks_practical, credit_hours, is_compulsory, credit_th, credit_in, school_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [row.id, row.name, row.code, row.class, row.faculty, row.full_marks_theory, row.full_marks_practical, row.pass_marks_theory, row.pass_marks_practical, row.credit_hours, row.is_compulsory, row.credit_th, row.credit_in, sid]);
      }
    }
    if (data.marks && sid) {
      for (const row of data.marks) {
        await execute(`INSERT OR REPLACE INTO marks (id, student_id, subject_id, exam_type, theory_marks, practical_marks, grade_point, grade, session, school_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [row.id, row.student_id, row.subject_id, row.exam_type, row.theory_marks||0, row.practical_marks||0, row.grade_point||0, row.grade||'NG', row.session, sid]);
      }
    }
    if (data.results && sid) {
      for (const row of data.results) {
        await execute(`INSERT OR REPLACE INTO results (id, student_id, session, class, faculty, exam_type, total_theory, total_practical, grand_total, total_credit_hours, weighted_grade_points, gpa, grade, status, rank, school_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [row.id, row.student_id, row.session, row.class, row.faculty, row.exam_type, row.total_theory||0, row.total_practical||0, row.grand_total||0, row.total_credit_hours||0, row.weighted_grade_points||0, row.gpa||0, row.grade||'NG', row.status||'Pass', row.rank||null, sid]);
      }
    }
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Backup ───
router.get('/backup', authMiddleware, async (req, res) => {
  try {
    const sid = scrId(req);
    const tables = ['students', 'subjects', 'teachers', 'staff', 'sections', 'routines', 'fee_setup', 'fee_collections', 'fee_collection_items', 'books', 'book_issues', 'subject_registrations', 'marks', 'results'];
    const data = {};
    for (const t of tables) {
      data[t] = sid ? await query(`SELECT * FROM ${t} WHERE school_id=?`, [sid]) : await query(`SELECT * FROM ${t}`);
    }
    data.settings = await query("SELECT * FROM settings");
    data.schools = await query("SELECT * FROM schools");
    data.users = await query("SELECT id, username, full_name, email, phone, role, school_id, is_active, last_login, created_at FROM users");
    return res.json({ success: true, data });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

// ─── Nepali BS→AD ───
router.get('/nepali-bs-to-ad', authMiddleware, async (req, res) => {
  try {
    const { bs } = req.query;
    if (!bs) return res.json({ success: false, error: 'BS date required' });
    let adDate = bs;
    try {
      const nd = require('nepali-date');
      const ndLib = require('nepali-date-library');
      if (typeof nd.bs2ad === 'function') adDate = nd.bs2ad(bs);
      else if (typeof ndLib.bsToAd === 'function') adDate = ndLib.bsToAd(bs);
    } catch (ignored) {}
    return res.json({ success: true, data: adDate });
  } catch (e) { return res.json({ success: false, error: e.message }); }
});

module.exports = router;
