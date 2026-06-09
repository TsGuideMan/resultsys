const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const stream = require('stream');
const initSqlJs = require('sql.js');
const JSZip = require('jszip');
const { drive, auth: driveAuth } = require('@googleapis/drive');
const { BStoAD } = require('nepali-date-library');

let mainWindow;
let db;
let dbReady = false;
let driveAuthClient = null;
let driveBackupTimer = null;
let oauthServer = null;
let currentUser = null; // { id, username, role, school_id, full_name }
let sessionSchoolId = null; // For school switching (super_admin)

function schoolFilter(alias) {
  const p = alias ? alias + '.' : '';
  if (currentUser && currentUser.role === 'super_admin' && !sessionSchoolId) return { sql: '', params: [] };
  const sid = sessionSchoolId || (currentUser ? currentUser.school_id : null);
  if (!sid) return { sql: '', params: [] };
  return { sql: ` AND ${p}school_id=?`, params: [sid] };
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const DATA_DIR = path.join(app.getPath('userData'), 'data');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
  createTables();
  // Fix old CHECK constraints on ALL class-constrained tables
  try {
    for (const tname of ['students','sections','routines','fee_setup','subjects']) {
      const r = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tname}'`);
      if (!r.length || !r[0].values.length) continue;
      let sql = r[0].values[0][0];
      // Skip if no CHECK on class, or already has the new full list
      const hasOldCheck = sql.includes('CHECK') && /"?class"?\s+IN\s*\(\s*'11'\s*,\s*'12'\s*\)/i.test(sql);
      if (!hasOldCheck) continue;
      // Replace the old CHECK with new one
      const newCheck = tname === 'fee_setup'
        ? "CHECK(class IN ('ECD','1','2','3','4','5','6','7','8','9','10','11','12',''))"
        : "CHECK(class IN ('ECD','1','2','3','4','5','6','7','8','9','10','11','12'))";
      const newSql = sql.replace(/CHECK\s*\(\s*"?class"?\s+IN\s*\([^)]+\)\s*\)/i, newCheck);
      // Create temp table using modified SQL, then sync extra columns
      db.run('PRAGMA foreign_keys = OFF');
      db.run('BEGIN TRANSACTION');
      db.run(`CREATE TABLE ${tname}_tmp (${newSql.substring(newSql.indexOf('(')+1, newSql.lastIndexOf(')'))})`);
      // Add any columns that exist in old table but not in new (migration-added)
      const oldCols = db.exec(`PRAGMA table_info(${tname})`)[0].values.map(row => row[1]);
      const newCols = db.exec(`PRAGMA table_info(${tname}_tmp)`)[0].values.map(row => row[1]);
      for (const oc of oldCols) {
        if (!newCols.includes(oc)) {
          const defRow = db.exec(`PRAGMA table_info(${tname})`)[0].values.find(row => row[1] === oc);
          let colDef = `${defRow[2]}`;
          if (defRow[3]) colDef += ' NOT NULL';
          if (defRow[4] !== null) colDef += ` DEFAULT ${defRow[4]}`;
          db.run(`ALTER TABLE ${tname}_tmp ADD COLUMN ${oc} ${colDef}`);
        }
      }
      // Copy data using exact column names
      db.run(`INSERT INTO ${tname}_tmp (${oldCols.join(',')}) SELECT ${oldCols.join(',')} FROM ${tname}`);
      db.run(`DROP TABLE ${tname}`);
      db.run(`ALTER TABLE ${tname}_tmp RENAME TO ${tname}`);
      db.run('COMMIT');
      db.run('PRAGMA foreign_keys = ON');
    }
  } catch(e) { /* class check migration done */ }
  // Fix marks exam_type CHECK to allow term1, term2, annual
  try {
    const r = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='marks'`);
    if (r.length && r[0].values.length) {
      let sql = r[0].values[0][0];
      const oldCheck = /exam_type\s+TEXT\s+DEFAULT\s+'final'\s+CHECK\(\s*exam_type\s+IN\s*\([^)]+\)\s*\)/i;
      if (oldCheck.test(sql)) {
        const newExamTypeDef = "exam_type TEXT DEFAULT 'final' CHECK(exam_type IN ('final','supplementary','annual','term1','term2'))";
        const newSql = sql.replace(oldCheck, newExamTypeDef);
        if (newSql !== sql) {
          db.run('PRAGMA foreign_keys = OFF');
          db.run('BEGIN TRANSACTION');
          db.run(`CREATE TABLE marks_tmp (${newSql.substring(newSql.indexOf('(')+1, newSql.lastIndexOf(')'))})`);
          const oldCols = db.exec(`PRAGMA table_info(marks)`)[0].values.map(row => row[1]);
          const newCols = db.exec(`PRAGMA table_info(marks_tmp)`)[0].values.map(row => row[1]);
          for (const oc of oldCols) {
            if (!newCols.includes(oc)) {
              const defRow = db.exec(`PRAGMA table_info(marks)`)[0].values.find(row => row[1] === oc);
              let colDef = `${defRow[2]}`;
              if (defRow[3]) colDef += ' NOT NULL';
              if (defRow[4] !== null) colDef += ` DEFAULT ${defRow[4]}`;
              db.run(`ALTER TABLE marks_tmp ADD COLUMN ${oc} ${colDef}`);
            }
          }
          db.run(`INSERT INTO marks_tmp (${oldCols.join(',')}) SELECT ${oldCols.join(',')} FROM marks`);
          db.run(`DROP TABLE marks`);
          db.run(`ALTER TABLE marks_tmp RENAME TO marks`);
          db.run('COMMIT');
          db.run('PRAGMA foreign_keys = ON');
        }
      }
    }
  } catch(e) { /* marks exam_type check migration done */ }
  saveDatabase();
}

function saveDatabase() {
  if (!db) return;
  ensureDataDir();
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      municipality TEXT DEFAULT '',
      district TEXT DEFAULT '',
      province TEXT DEFAULT '',
      estd TEXT DEFAULT '',
      iemis_id TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      head_teacher TEXT DEFAULT '',
      school_logo TEXT,
      watermark_text TEXT,
      watermark_color TEXT DEFAULT '#1a3a5c',
      watermark_font_size INTEGER DEFAULT 10,
      watermark_repeat INTEGER DEFAULT 200,
      watermark_line_height REAL DEFAULT 2.4,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'school_admin'
        CHECK(role IN ('super_admin','school_admin','teacher','accountant','librarian','staff')),
      school_id INTEGER,
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      sym TEXT,
      reg TEXT,
      class TEXT NOT NULL CHECK(class IN ('ECD','1','2','3','4','5','6','7','8','9','10','11','12')),
      faculty TEXT NOT NULL,
      session TEXT NOT NULL,
      gender TEXT,
      dob TEXT,
      dob_bs TEXT,
      guardian_name TEXT,
      address TEXT,
      phone TEXT,
      photo_path TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_type TEXT NOT NULL CHECK(person_type IN ('teacher','staff')),
      person_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present','Absent','Leave','Half Day')),
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  // Add father_name and mother_name columns if missing
  try { db.run("ALTER TABLE students ADD COLUMN father_name TEXT DEFAULT ''"); } catch(e) {}
  try { db.run("ALTER TABLE students ADD COLUMN mother_name TEXT DEFAULT ''"); } catch(e) {}
  db.run(`
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class TEXT NOT NULL CHECK(class IN ('ECD','1','2','3','4','5','6','7','8','9','10','11','12')),
      name TEXT NOT NULL,
      class_teacher_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(class, name)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class TEXT NOT NULL CHECK(class IN ('ECD','1','2','3','4','5','6','7','8','9','10','11','12')),
      section TEXT,
      day TEXT NOT NULL,
      period INTEGER NOT NULL,
      subject TEXT,
      teacher_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(class, section, day, period)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS fee_setup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      class TEXT CHECK(class IN ('ECD','1','2','3','4','5','6','7','8','9','10','11','12','')),
      faculty TEXT DEFAULT '',
      session TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS fee_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      session TEXT NOT NULL,
      total_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'Cash',
      remarks TEXT,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS fee_collection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL,
      fee_item_id INTEGER,
      fee_name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (collection_id) REFERENCES fee_collections(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      publisher TEXT DEFAULT '',
      isbn TEXT DEFAULT '',
      category TEXT DEFAULT '',
      quantity INTEGER DEFAULT 1,
      available_quantity INTEGER DEFAULT 1,
      rack_no TEXT DEFAULT '',
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS book_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      return_date TEXT,
      status TEXT DEFAULT 'issued',
      remarks TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      class TEXT NOT NULL CHECK(class IN ('ECD','1','2','3','4','5','6','7','8','9','10','11','12')),
      faculty TEXT NOT NULL DEFAULT 'General',
      full_marks_theory REAL DEFAULT 75,
      full_marks_practical REAL DEFAULT 25,
      pass_marks_theory REAL DEFAULT 27,
      pass_marks_practical REAL DEFAULT 9,
      credit_hours REAL DEFAULT 5,
      is_compulsory INTEGER DEFAULT 1,
      credit_th REAL DEFAULT 3,
      credit_in REAL DEFAULT 2,
      term1_full_marks REAL DEFAULT 0,
      term1_pass_marks REAL DEFAULT 0,
      term1_credit_hours REAL DEFAULT 0,
      term2_full_marks REAL DEFAULT 0,
      term2_pass_marks REAL DEFAULT 0,
      term2_credit_hours REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  try { db.run("ALTER TABLE subjects ADD COLUMN credit_th REAL DEFAULT 3"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN credit_in REAL DEFAULT 2"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN display_seq REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term1_full_marks REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term1_pass_marks REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term1_credit_hours REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term2_full_marks REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term2_pass_marks REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term2_credit_hours REAL DEFAULT 0"); } catch(e) {}
  db.run(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dob TEXT,
      qualification TEXT,
      subject TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      gender TEXT,
      join_date TEXT,
      salary REAL DEFAULT 0,
      photo_path TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dob TEXT,
      designation TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      gender TEXT,
      join_date TEXT,
      salary REAL DEFAULT 0,
      photo_path TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS subject_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      session TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(student_id, subject_id, session),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      exam_type TEXT DEFAULT 'final' CHECK(exam_type IN ('final','supplementary','annual','term1','term2')),
      theory_marks REAL DEFAULT 0,
      practical_marks REAL DEFAULT 0,
      grade_point REAL DEFAULT 0,
      grade TEXT DEFAULT 'NG',
      theory_grade TEXT,
      theory_grade_point REAL,
      practical_grade TEXT,
      practical_grade_point REAL,
      session TEXT NOT NULL,
      UNIQUE(student_id, subject_id, exam_type, session),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    )
  `);
  try { db.run("ALTER TABLE marks ADD COLUMN theory_grade TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE marks ADD COLUMN theory_grade_point REAL"); } catch(e) {}
  try { db.run("ALTER TABLE marks ADD COLUMN practical_grade TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE marks ADD COLUMN practical_grade_point REAL"); } catch(e) {}
  // Backfill theory_grade/practical_grade for existing marks
  const unfilled = db.exec(`SELECT m.id, m.theory_marks, m.practical_marks,
    s.full_marks_theory, s.full_marks_practical,
    s.pass_marks_theory, s.pass_marks_practical
    FROM marks m JOIN subjects s ON m.subject_id = s.id
    WHERE m.theory_grade IS NULL`);
  if (unfilled.length > 0) {
    for (const row of unfilled[0].values) {
      const cols = unfilled[0].columns;
      const get = (name) => row[cols.indexOf(name)];
      const id = get('id');
      const theoryRes = calcGrade(get('theory_marks'), get('full_marks_theory'), get('pass_marks_theory'));
      const practicalRes = calcGrade(get('practical_marks'), get('full_marks_practical'), get('pass_marks_practical'));
      db.run(`UPDATE marks SET theory_grade=?, theory_grade_point=?, practical_grade=?, practical_grade_point=?
        WHERE id=?`,
        [theoryRes.grade, theoryRes.gp, practicalRes.grade, practicalRes.gp, id]);
    }
    saveDatabase();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      session TEXT NOT NULL,
      class TEXT NOT NULL,
      faculty TEXT NOT NULL,
      exam_type TEXT DEFAULT 'final',
      total_theory REAL DEFAULT 0,
      total_practical REAL DEFAULT 0,
      grand_total REAL DEFAULT 0,
      total_credit_hours REAL DEFAULT 0,
      weighted_grade_points REAL DEFAULT 0,
      gpa REAL DEFAULT 0,
      grade TEXT DEFAULT 'NG',
      status TEXT DEFAULT 'Pass' CHECK(status IN ('Pass','Fail','Supplementary')),
      rank INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(student_id, session, exam_type),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  migrateToMultiSchool();
  // Ensure default admin exists on fresh database
  const userCount = db.exec("SELECT COUNT(*) as cnt FROM users");
  if (!userCount.length || userCount[0].values[0][0] === 0) {
    db.run("INSERT INTO users (username, password_hash, full_name, role, school_id, is_active) VALUES (?,?,?,?,?,?)",
      ['admin', 'admin123', 'Super Admin', 'super_admin', null, 1]);
  }
  const ses = db.exec("SELECT value FROM settings WHERE key='current_session'");
  if (ses.length === 0) {
    const year = new Date().getFullYear();
    const session = `${year-1}/${year}`;
    db.run("INSERT INTO settings (key, value) VALUES ('current_session', ?)", [session]);
  }
  const profileDefaults = {
    school_name: 'SARASWATI JANATA SECONDARY SCHOOL',
    municipality: 'BELDANDI RURAL MUNICIPALITY - 4, KANCHANPUR',
    province: 'Sudurpashima Province',
    estd: '2017 BS',
    exam_year_bs: '2083',
    exam_year_ad: '2026',
    head_teacher: 'MAN SINGH RANA',
    iemis_id: '',
    prepared_by: '',
    checked_by: '',
    final_date_issue: '2081-03-05'
  };
  Object.entries(profileDefaults).forEach(([k, v]) => {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [k, v]);
  });
}

function ensureUserColumns() {
  try { db.run(`ALTER TABLE users ADD COLUMN school_id INTEGER`); } catch (e) {}
  try { db.run(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`); } catch (e) {}
  try { db.run(`ALTER TABLE users ADD COLUMN last_login TEXT`); } catch (e) {}
  try { db.run(`ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))`); } catch (e) {}
  try { db.run(`ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''`); } catch (e) {}
  try { db.run(`ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''`); } catch (e) {}
}

function migrateToMultiSchool() {
  try {
    const sc = db.exec("SELECT COUNT(*) as cnt FROM schools");
    if (sc[0].values[0][0] > 0) {
      // Already migrated — ensure user columns exist + fix old admin role
      ensureUserColumns();
      try { db.run("UPDATE users SET role='super_admin' WHERE role='admin'"); } catch (e) {}
      try { db.run("UPDATE users SET school_id=(SELECT MIN(id) FROM schools) WHERE school_id IS NULL AND role='super_admin'"); } catch (e) {}
      try { db.run("DROP TABLE IF EXISTS users_old"); } catch (e) {}
      saveDatabase();
      return;
    }
    const s = getAllSettings().data || {};
    const schoolName = s.school_name || 'SARASWATI JANATA SECONDARY SCHOOL';
    db.run(`INSERT INTO schools (name, municipality, province, estd, iemis_id, phone, head_teacher, school_logo,
            watermark_text, watermark_color, watermark_font_size, watermark_repeat, watermark_line_height)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [schoolName, s.municipality||'', s.province||'', s.estd||'', s.iemis_id||'', s.phone||'',
       s.head_teacher||'', s.school_logo||null, s.watermark_text||null, s.watermark_color||'#1a3a5c',
       s.watermark_font_size||10, s.watermark_repeat||200, s.watermark_line_height||2.4]);
    const firstId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];

    const tables = ['students','subjects','teachers','staff','sections','routines','attendance',
                    'fee_setup','fee_collections','books','book_issues','subject_registrations','marks','results'];
    tables.forEach(t => {
      try { db.run(`ALTER TABLE ${t} ADD COLUMN school_id INTEGER DEFAULT ${firstId}`); } catch (e) {}
    });
    ensureUserColumns();
    try {
      const rCheck = db.exec("SELECT role FROM users LIMIT 1");
      if (rCheck.length && rCheck[0].values.length) {
        const oldRole = rCheck[0].values[0][0];
        if (oldRole === 'admin') {
          db.run(`UPDATE users SET role='super_admin', school_id=? WHERE role='admin'`, [firstId]);
        }
      }
    } catch (e) {}
    saveDatabase();
  } catch (e) { console.error('Migration error:', e); }
}

function login(username, password) {
  try {
    const r = db.exec("SELECT u.*, s.name as school_name FROM users u LEFT JOIN schools s ON u.school_id=s.id WHERE u.username=? LIMIT 1", [username]);
    if (!r.length || !r[0].values.length) return { success: false, error: 'Invalid username or password' };
    const cols = r[0].columns;
    const row = r[0].values[0];
    const user = {};
    cols.forEach((c, i) => user[c] = row[i]);
    if (user.password_hash !== password) return { success: false, error: 'Invalid username or password' };
    if (!user.is_active) return { success: false, error: 'Account is deactivated' };
    db.run("UPDATE users SET last_login=datetime('now','localtime') WHERE id=?", [user.id]);
    saveDatabase();
    currentUser = { id: user.id, username: user.username, role: user.role, school_id: user.school_id, full_name: user.full_name };
    sessionSchoolId = user.school_id;
    return { success: true, user: { id: user.id, username: user.username, role: user.role, school_id: user.school_id, full_name: user.full_name, school_name: user.school_name } };
  } catch (e) { return handleError(e); }
}

function logout() {
  currentUser = null;
  sessionSchoolId = null;
  return { success: true };
}

function getCurrentUser() {
  if (!currentUser) return { success: false, error: 'Not logged in' };
  const r = db.exec("SELECT u.*, s.name as school_name FROM users u LEFT JOIN schools s ON u.school_id=s.id WHERE u.id=?", [currentUser.id]);
  if (!r.length || !r[0].values.length) return { success: false, error: 'User not found' };
  const cols = r[0].columns; const row = r[0].values[0];
  const user = {};
  cols.forEach((c, i) => user[c] = row[i]);
  user.switched_school_id = sessionSchoolId;
  return { success: true, user };
}

function switchSchool(schoolId) {
  if (!currentUser) return { success: false, error: 'Not logged in' };
  if (currentUser.role !== 'super_admin') return { success: false, error: 'Not authorized' };
  sessionSchoolId = schoolId || null;
  return { success: true, school_id: sessionSchoolId };
}

function changePassword(userId, currentPassword, newPassword) {
  try {
    const r = db.exec("SELECT password_hash FROM users WHERE id=?", [userId]);
    if (!r.length || !r[0].values.length) return { success: false, error: 'User not found' };
    if (r[0].values[0][0] !== currentPassword) return { success: false, error: 'Current password is incorrect' };
    db.run("UPDATE users SET password_hash=? WHERE id=?", [newPassword, userId]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getSchools() {
  try {
    const r = db.exec("SELECT s.*, (SELECT COUNT(*) FROM students st WHERE st.school_id=s.id) as student_count FROM schools s ORDER BY s.name");
    if (!r.length) return { success: true, data: [] };
    return { success: true, data: r[0].values.map(row => { const o={}; r[0].columns.forEach((c,i)=>o[c]=row[i]); return o; }) };
  } catch (e) { return handleError(e); }
}

function getSchool(id) {
  try {
    const r = db.exec("SELECT * FROM schools WHERE id=?", [id]);
    if (!r.length || !r[0].values.length) return { success: false, error: 'School not found' };
    const o={}; r[0].columns.forEach((c,i)=>o[c]=r[0].values[0][i]); return { success: true, data: o };
  } catch (e) { return handleError(e); }
}

function addSchool(data) {
  try {
    db.run(`INSERT INTO schools (name, municipality, district, province, estd, iemis_id, phone, email, head_teacher, school_logo,
            watermark_text, watermark_color, watermark_font_size, watermark_repeat, watermark_line_height)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [data.name, data.municipality||'', data.district||'', data.province||'', data.estd||'',
       data.iemis_id||'', data.phone||'', data.email||'', data.head_teacher||'', data.school_logo||null,
       data.watermark_text||null, data.watermark_color||'#1a3a5c',
       data.watermark_font_size||10, data.watermark_repeat||200, data.watermark_line_height||2.4]);
    saveDatabase();
    return { success: true, id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] };
  } catch (e) { return handleError(e); }
}

function updateSchool(id, data) {
  try {
    db.run(`UPDATE schools SET name=?, municipality=?, district=?, province=?, estd=?, iemis_id=?, phone=?, email=?,
            head_teacher=?, school_logo=?, watermark_text=?, watermark_color=?, watermark_font_size=?,
            watermark_repeat=?, watermark_line_height=? WHERE id=?`,
      [data.name, data.municipality||'', data.district||'', data.province||'', data.estd||'',
       data.iemis_id||'', data.phone||'', data.email||'', data.head_teacher||'', data.school_logo||null,
       data.watermark_text||null, data.watermark_color||'#1a3a5c',
       data.watermark_font_size||10, data.watermark_repeat||200, data.watermark_line_height||2.4, id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteSchool(id) {
  try {
    db.run("DELETE FROM schools WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getUsers(schoolId) {
  try {
    let sql = "SELECT u.*, s.name as school_name FROM users u LEFT JOIN schools s ON u.school_id=s.id WHERE 1=1";
    const params = [];
    if (schoolId) { sql += " AND u.school_id=?"; params.push(schoolId); }
    sql += " ORDER BY u.full_name ASC";
    const r = db.exec(sql, params);
    if (!r.length) return { success: true, data: [] };
    return { success: true, data: r[0].values.map(row => { const o={}; r[0].columns.forEach((c,i)=>o[c]=row[i]); return o; }) };
  } catch (e) { return handleError(e); }
}

function addUser(data) {
  try {
    const exists = db.exec("SELECT id FROM users WHERE username=?", [data.username]);
    if (exists.length && exists[0].values.length) return { success: false, error: 'Username already exists' };
    db.run(`INSERT INTO users (username, password_hash, full_name, email, phone, role, school_id, is_active)
            VALUES (?,?,?,?,?,?,?,?)`,
      [data.username, data.password, data.full_name||'', data.email||'', data.phone||'',
       data.role||'school_admin', data.school_id||null, data.is_active!==undefined ? data.is_active : 1]);
    saveDatabase();
    return { success: true, id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] };
  } catch (e) { return handleError(e); }
}

function updateUser(id, data) {
  try {
    db.run(`UPDATE users SET full_name=?, email=?, phone=?, role=?, school_id=?, is_active=? WHERE id=?`,
      [data.full_name||'', data.email||'', data.phone||'', data.role||'school_admin',
       data.school_id||null, data.is_active!==undefined ? data.is_active : 1, id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteUser(id) {
  try {
    if (currentUser && currentUser.id === id) return { success: false, error: 'Cannot delete yourself' };
    db.run("DELETE FROM users WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getGlobalDashboardStats() {
  try {
    const schools = db.exec("SELECT id, name FROM schools WHERE is_active=1");
    const schoolList = schools.length ? schools[0].values.map(row => { const o={}; schools[0].columns.forEach((c,i)=>o[c]=row[i]); return o; }) : [];
    const totalStudents = db.exec("SELECT COUNT(*) as c FROM students")[0].values[0][0];
    const totalTeachers = db.exec("SELECT COUNT(*) as c FROM teachers")[0].values[0][0];
    const totalResults = db.exec("SELECT COUNT(*) as c FROM results")[0].values[0][0];
    const passed = db.exec("SELECT COUNT(*) as c FROM results WHERE status='Pass'")[0].values[0][0];
    const failed = db.exec("SELECT COUNT(*) as c FROM results WHERE status='Fail'")[0].values[0][0];
    const supplementary = db.exec("SELECT COUNT(*) as c FROM results WHERE status='Supplementary'")[0].values[0][0];
    return { success: true, data: { schools: schoolList, totalStudents, totalTeachers, totalResults, passed, failed, supplementary } };
  } catch (e) { return handleError(e); }
}

function handleError(err) {
  return { success: false, error: err.message || String(err) };
}

function addStudent(data) {
  try {
    db.run(`INSERT INTO students (name, roll_no, sym, reg, class, faculty, session, gender, dob, dob_bs, father_name, mother_name, guardian_name, address, phone, photo_path, school_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.roll_no, data.sym, data.reg, data.class, data.faculty, data.session, data.gender, data.dob, data.dob_bs,
       data.father_name || '', data.mother_name || '', data.guardian_name, data.address, data.phone, data.photo_path || null, data.school_id || null]);
    saveDatabase();
    return { success: true, id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] };
  } catch (e) { return handleError(e); }
}

function updateStudent(id, data) {
  try {
    db.run(`UPDATE students SET name=?, roll_no=?, sym=?, reg=?, class=?, faculty=?, session=?, gender=?, dob=?, dob_bs=?,
            father_name=?, mother_name=?, guardian_name=?, address=?, phone=?, photo_path=?, updated_at=datetime('now','localtime') WHERE id=?`,
      [data.name, data.roll_no, data.sym, data.reg, data.class, data.faculty, data.session, data.gender, data.dob, data.dob_bs,
       data.father_name || '', data.mother_name || '', data.guardian_name, data.address, data.phone, data.photo_path || null, id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteStudent(id) {
  try {
    db.run("DELETE FROM marks WHERE student_id=?", [id]);
    db.run("DELETE FROM results WHERE student_id=?", [id]);
    db.run("DELETE FROM subject_registrations WHERE student_id=?", [id]);
    db.run("DELETE FROM students WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteMultipleStudents(ids) {
  try {
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM marks WHERE student_id IN (${placeholders})`, ids);
    db.run(`DELETE FROM results WHERE student_id IN (${placeholders})`, ids);
    db.run(`DELETE FROM subject_registrations WHERE student_id IN (${placeholders})`, ids);
    db.run(`DELETE FROM students WHERE id IN (${placeholders})`, ids);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getStudents(query) {
  try {
    let sql = "SELECT * FROM students WHERE 1=1";
    const params = [];
    if (query.class) { sql += " AND class=?"; params.push(query.class); }
    if (query.faculty) { sql += " AND faculty=?"; params.push(query.faculty); }
    if (query.session) { sql += " AND session=?"; params.push(query.session); }
    if (query.school_id) { sql += " AND school_id=?"; params.push(query.school_id); }
    if (query.search) {
      sql += " AND (name LIKE ? OR roll_no LIKE ?)";
      params.push(`%${query.search}%`, `%${query.search}%`);
    }
    sql += " ORDER BY roll_no ASC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      const cols = result[0].columns;
      cols.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function getStudent(id) {
  try {
    const result = db.exec("SELECT * FROM students WHERE id=?", [id]);
    if (result.length === 0) return { success: false, error: 'Student not found' };
    const cols = result[0].columns;
    const row = result[0].values[0];
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return { success: true, data: obj };
  } catch (e) { return handleError(e); }
}

function addSubject(data) {
  try {
    db.run(`INSERT INTO subjects (name, code, class, faculty, full_marks_theory, full_marks_practical,
            pass_marks_theory, pass_marks_practical, credit_hours, is_compulsory, credit_th, credit_in, display_seq,
            term1_full_marks, term1_pass_marks, term1_credit_hours, term2_full_marks, term2_pass_marks, term2_credit_hours, school_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.code, data.class, data.faculty, data.full_marks_theory, data.full_marks_practical,
       data.pass_marks_theory, data.pass_marks_practical, data.credit_hours, data.is_compulsory,
       data.credit_th, data.credit_in, data.display_seq || 0,
       data.term1_full_marks || 0, data.term1_pass_marks || 0, data.term1_credit_hours || 0,
       data.term2_full_marks || 0, data.term2_pass_marks || 0, data.term2_credit_hours || 0,
       data.school_id || null]);
    saveDatabase();
    return { success: true, id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] };
  } catch (e) { return handleError(e); }
}

function updateSubject(id, data) {
  try {
    db.run(`UPDATE subjects SET name=?, code=?, class=?, faculty=?, full_marks_theory=?, full_marks_practical=?,
            pass_marks_theory=?, pass_marks_practical=?, credit_hours=?, is_compulsory=?, credit_th=?, credit_in=?, display_seq=?,
            term1_full_marks=?, term1_pass_marks=?, term1_credit_hours=?, term2_full_marks=?, term2_pass_marks=?, term2_credit_hours=? WHERE id=?`,
      [data.name, data.code, data.class, data.faculty, data.full_marks_theory, data.full_marks_practical,
       data.pass_marks_theory, data.pass_marks_practical, data.credit_hours, data.is_compulsory,
       data.credit_th, data.credit_in, data.display_seq || 0,
       data.term1_full_marks || 0, data.term1_pass_marks || 0, data.term1_credit_hours || 0,
       data.term2_full_marks || 0, data.term2_pass_marks || 0, data.term2_credit_hours || 0, id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteSubject(id) {
  try {
    db.run("DELETE FROM marks WHERE subject_id=?", [id]);
    db.run("DELETE FROM results WHERE id IN (SELECT r.id FROM results r JOIN marks m ON r.student_id=m.student_id WHERE m.subject_id=?)", [id]);
    db.run("DELETE FROM subject_registrations WHERE subject_id=?", [id]);
    db.run("DELETE FROM subjects WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteMultipleSubjects(ids) {
  try {
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM marks WHERE subject_id IN (${placeholders})`, ids);
    db.run(`DELETE FROM subject_registrations WHERE subject_id IN (${placeholders})`, ids);
    db.run(`DELETE FROM subjects WHERE id IN (${placeholders})`, ids);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function addTeacher(data) {
  try {
    db.run(`INSERT INTO teachers (name, dob, qualification, subject, phone, email, address, gender, join_date, salary, photo_path, school_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.dob, data.qualification, data.subject, data.phone, data.email, data.address, data.gender, data.join_date, data.salary, data.photo_path || null, data.school_id || null]);
    saveDatabase();
    return { success: true, id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] };
  } catch (e) { return handleError(e); }
}

function updateTeacher(id, data) {
  try {
    db.run(`UPDATE teachers SET name=?, dob=?, qualification=?, subject=?, phone=?, email=?, address=?, gender=?, join_date=?, salary=?, photo_path=?, updated_at=datetime('now','localtime') WHERE id=?`,
      [data.name, data.dob, data.qualification, data.subject, data.phone, data.email, data.address, data.gender, data.join_date, data.salary, data.photo_path || null, id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteTeacher(id) {
  try {
    db.run("DELETE FROM teachers WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteMultipleTeachers(ids) {
  try {
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM teachers WHERE id IN (${placeholders})`, ids);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getTeachers(query) {
  try {
    let sql = "SELECT * FROM teachers WHERE 1=1";
    const params = [];
    if (query.search) {
      sql += " AND (name LIKE ? OR phone LIKE ? OR subject LIKE ?)";
      params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`);
    }
    if (query.school_id) { sql += " AND school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY name ASC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function getTeacher(id) {
  try {
    const result = db.exec("SELECT * FROM teachers WHERE id=?", [id]);
    if (result.length === 0) return { success: false, error: 'Teacher not found' };
    const obj = {};
    result[0].columns.forEach((c, i) => obj[c] = result[0].values[0][i]);
    return { success: true, data: obj };
  } catch (e) { return handleError(e); }
}

function addStaff(data) {
  try {
    db.run(`INSERT INTO staff (name, dob, designation, phone, email, address, gender, join_date, salary, photo_path, school_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.dob, data.designation, data.phone, data.email, data.address, data.gender, data.join_date, data.salary, data.photo_path || null, data.school_id || null]);
    saveDatabase();
    return { success: true, id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] };
  } catch (e) { return handleError(e); }
}

function updateStaff(id, data) {
  try {
    db.run(`UPDATE staff SET name=?, dob=?, designation=?, phone=?, email=?, address=?, gender=?, join_date=?, salary=?, photo_path=?, updated_at=datetime('now','localtime') WHERE id=?`,
      [data.name, data.dob, data.designation, data.phone, data.email, data.address, data.gender, data.join_date, data.salary, data.photo_path || null, id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteStaff(id) {
  try {
    db.run("DELETE FROM staff WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteMultipleStaff(ids) {
  try {
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM staff WHERE id IN (${placeholders})`, ids);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getStaffList(query) {
  try {
    let sql = "SELECT * FROM staff WHERE 1=1";
    const params = [];
    if (query.search) {
      sql += " AND (name LIKE ? OR phone LIKE ? OR designation LIKE ?)";
      params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`);
    }
    if (query.school_id) { sql += " AND school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY name ASC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function getStaff(id) {
  try {
    const result = db.exec("SELECT * FROM staff WHERE id=?", [id]);
    if (result.length === 0) return { success: false, error: 'Staff not found' };
    const obj = {};
    result[0].columns.forEach((c, i) => obj[c] = result[0].values[0][i]);
    return { success: true, data: obj };
  } catch (e) { return handleError(e); }
}

function saveAttendance(dataList) {
  try {
    const upsert = db.prepare(`INSERT OR REPLACE INTO attendance (person_type, person_id, date, status, remarks, school_id)
      VALUES (?, ?, ?, ?, ?, ?)`);
    for (const row of dataList) {
      upsert.run([row.person_type, row.person_id, row.date, row.status, row.remarks || null, row.school_id || null]);
    }
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getAttendance(query) {
  try {
    let sql = "SELECT * FROM attendance WHERE 1=1";
    const params = [];
    if (query.date) { sql += " AND date=?"; params.push(query.date); }
    if (query.person_type) { sql += " AND person_type=?"; params.push(query.person_type); }
    if (query.person_id) { sql += " AND person_id=?"; params.push(query.person_id); }
    if (query.school_id) { sql += " AND school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY person_type, person_id";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function getAttendanceStats(studentId, session) {
  try {
    // School open days: distinct dates where any student attendance was taken for this school
    const schoolResult = db.exec(`
      SELECT COUNT(DISTINCT a.date) as total_days
      FROM attendance a JOIN students s ON a.person_id = s.id
      WHERE a.person_type='student' AND s.session=? AND a.school_id=?
    `, [session, getSchoolIdFromSession()]);
    const schoolOpenDays = schoolResult.length > 0 ? (schoolResult[0].values[0][0] || 0) : 0;
    // Student present days
    const studResult = db.exec(`
      SELECT COUNT(DISTINCT date) as present_days FROM attendance
      WHERE person_id=? AND person_type='student' AND status='Present' AND school_id=?
    `, [studentId, getSchoolIdFromSession()]);
    const presentDays = studResult.length > 0 ? (studResult[0].values[0][0] || 0) : 0;
    const percentage = schoolOpenDays > 0 ? Math.round((presentDays / schoolOpenDays) * 100) : 0;
    return { success: true, data: { schoolOpenDays, presentDays, percentage } };
  } catch (e) { return handleError(e); }
}

function getSections(query) {
  try {
    let sql = "SELECT * FROM sections WHERE 1=1";
    const params = [];
    if (query.class) { sql += " AND class=?"; params.push(query.class); }
    if (query.school_id) { sql += " AND school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY class, name";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function addSection(data) {
  try {
    db.run("INSERT INTO sections (class, name, class_teacher_id, school_id) VALUES (?, ?, ?, ?)",
      [data.class, data.name, data.class_teacher_id || null, data.school_id || null]);
    saveDatabase();
    return { success: true, id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0] };
  } catch (e) { return handleError(e); }
}

function updateSection(id, data) {
  try {
    db.run("UPDATE sections SET name=?, class_teacher_id=? WHERE id=?",
      [data.name, data.class_teacher_id || null, id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteSection(id) {
  try {
    db.run("DELETE FROM sections WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getRoutines(query) {
  try {
    let sql = "SELECT * FROM routines WHERE 1=1";
    const params = [];
    if (query.class) { sql += " AND class=?"; params.push(query.class); }
    if (query.section) { sql += " AND section=?"; params.push(query.section); }
    if (query.school_id) { sql += " AND school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY day, period";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function saveRoutines(dataList) {
  try {
    const { class: cls, section, routines, school_id } = dataList;
    const sid = school_id || null;
    db.run("DELETE FROM routines WHERE class=? AND section=? AND school_id=?", [cls, section, sid]);
    const insert = db.prepare("INSERT INTO routines (class, section, day, period, subject, teacher_id, school_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const r of routines) {
      insert.run([cls, section, r.day, r.period, r.subject, r.teacher_id || null, sid]);
    }
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getFeeItems(query) {
  try {
    let sql = "SELECT * FROM fee_setup WHERE 1=1";
    const params = [];
    if (query.class) { sql += " AND class=?"; params.push(query.class); }
    if (query.faculty) { sql += " AND faculty=?"; params.push(query.faculty); }
    if (query.session) { sql += " AND session=?"; params.push(query.session); }
    if (query.school_id) { sql += " AND school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY name ASC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function addFeeItem(data) {
  try {
    db.run("INSERT INTO fee_setup (name, amount, class, faculty, session, school_id) VALUES (?, ?, ?, ?, ?, ?)",
      [data.name, data.amount, data.class || '', data.faculty || '', data.session, data.school_id || null]);
    saveDatabase();
    return { success: true, id: db.exec("SELECT last_insert_rowid()")[0].values[0][0] };
  } catch (e) { return handleError(e); }
}

function updateFeeItem(id, data) {
  try {
    db.run("UPDATE fee_setup SET name=?, amount=?, class=?, faculty=?, updated_at=datetime('now','localtime') WHERE id=?",
      [data.name, data.amount, data.class || '', data.faculty || '', id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteFeeItem(id) {
  try {
    db.run("DELETE FROM fee_setup WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getFeeCollections(query) {
  try {
    let sql = "SELECT fc.*, s.name as student_name, s.roll_no, s.class, s.faculty FROM fee_collections fc JOIN students s ON fc.student_id = s.id WHERE 1=1";
    const params = [];
    if (query.student_id) { sql += " AND fc.student_id=?"; params.push(query.student_id); }
    if (query.session) { sql += " AND fc.session=?"; params.push(query.session); }
    if (query.id) { sql += " AND fc.id=?"; params.push(query.id); }
    if (query.school_id) { sql += " AND fc.school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY fc.created_at DESC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function saveFeeCollection(data) {
  try {
    const { student_id, session, total_amount, paid_amount, discount, payment_method, remarks, date, items, school_id } = data;
    db.run("INSERT INTO fee_collections (student_id, session, total_amount, paid_amount, discount, payment_method, remarks, date, school_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [student_id, session, total_amount, paid_amount, discount || 0, payment_method || 'Cash', remarks || '', date, school_id || null]);
    const collId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    if (items && items.length) {
      const insert = db.prepare("INSERT INTO fee_collection_items (collection_id, fee_item_id, fee_name, amount) VALUES (?, ?, ?, ?)");
      for (const item of items) {
        insert.run([collId, item.fee_item_id || null, item.fee_name, item.amount]);
      }
    }
    saveDatabase();
    return { success: true, id: collId };
  } catch (e) { return handleError(e); }
}

function getFeeCollectionItems(collectionId) {
  try {
    const result = db.exec("SELECT * FROM fee_collection_items WHERE collection_id=?", [collectionId]);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function deleteFeeCollection(id) {
  try {
    db.run("DELETE FROM fee_collections WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

/* ======= Books ======= */

function getBooks(query) {
  try {
    let sql = "SELECT * FROM books WHERE 1=1";
    const params = [];
    if (query.title) { sql += " AND title LIKE ?"; params.push('%'+query.title+'%'); }
    if (query.author) { sql += " AND author LIKE ?"; params.push('%'+query.author+'%'); }
    if (query.category) { sql += " AND category=?"; params.push(query.category); }
    if (query.isbn) { sql += " AND isbn=?"; params.push(query.isbn); }
    if (query.school_id) { sql += " AND school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY title ASC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function getBook(id) {
  try {
    const result = db.exec("SELECT * FROM books WHERE id=?", [id]);
    if (result.length === 0 || !result[0].values.length) return { success: false, error: 'Not found' };
    const obj = {};
    result[0].columns.forEach((c, i) => obj[c] = result[0].values[0][i]);
    return { success: true, data: obj };
  } catch (e) { return handleError(e); }
}

function saveBook(data) {
  try {
    const { title, author, publisher, isbn, category, quantity, rack_no, description, school_id } = data;
    const qty = parseInt(quantity) || 1;
    if (data.id) {
      db.run("UPDATE books SET title=?, author=?, publisher=?, isbn=?, category=?, quantity=?, available_quantity=available_quantity+(?-quantity), rack_no=?, description=?, updated_at=datetime('now','localtime') WHERE id=?",
        [title, author||'', publisher||'', isbn||'', category||'', qty, qty, rack_no||'', description||'', data.id]);
    } else {
      db.run("INSERT INTO books (title, author, publisher, isbn, category, quantity, available_quantity, rack_no, description, school_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [title, author||'', publisher||'', isbn||'', category||'', qty, qty, rack_no||'', description||'', school_id || null]);
    }
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function deleteBook(id) {
  try {
    db.run("DELETE FROM books WHERE id=?", [id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getBookIssues(query) {
  try {
    let sql = "SELECT bi.*, b.title as book_title, b.author as book_author, b.isbn, s.name as student_name, s.roll_no, s.class, s.faculty FROM book_issues bi JOIN books b ON bi.book_id=b.id JOIN students s ON bi.student_id=s.id WHERE 1=1";
    const params = [];
    if (query.book_id) { sql += " AND bi.book_id=?"; params.push(query.book_id); }
    if (query.student_id) { sql += " AND bi.student_id=?"; params.push(query.student_id); }
    if (query.status) { sql += " AND bi.status=?"; params.push(query.status); }
    if (query.id) { sql += " AND bi.id=?"; params.push(query.id); }
    if (query.school_id) { sql += " AND bi.school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY bi.issue_date DESC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function issueBook(data) {
  try {
    const { book_id, student_id, issue_date, due_date, remarks, school_id } = data;
    const bookRes = db.exec("SELECT available_quantity FROM books WHERE id=?", [book_id]);
    if (!bookRes.length || !bookRes[0].values.length) return { success: false, error: 'Book not found' };
    const avail = bookRes[0].values[0][0];
    if (avail <= 0) return { success: false, error: 'No copies available' };
    db.run("INSERT INTO book_issues (book_id, student_id, issue_date, due_date, remarks, school_id) VALUES (?, ?, ?, ?, ?, ?)",
      [book_id, student_id, issue_date, due_date, remarks||'', school_id || null]);
    db.run("UPDATE books SET available_quantity=available_quantity-1 WHERE id=?", [book_id]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function returnBook(issueId, returnDate) {
  try {
    const issueRes = db.exec("SELECT book_id FROM book_issues WHERE id=? AND status='issued'", [issueId]);
    if (!issueRes.length || !issueRes[0].values.length) return { success: false, error: 'Issue record not found or already returned' };
    const bookId = issueRes[0].values[0][0];
    db.run("UPDATE book_issues SET return_date=?, status='returned' WHERE id=?", [returnDate, issueId]);
    db.run("UPDATE books SET available_quantity=available_quantity+1 WHERE id=?", [bookId]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getSubjects(query) {
  try {
    let sql = "SELECT * FROM subjects WHERE 1=1";
    const params = [];
    if (query.class) { sql += " AND class=?"; params.push(query.class); }
    if (query.faculty) { sql += " AND faculty=?"; params.push(query.faculty); }
    if (query.school_id) { sql += " AND school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY display_seq ASC, is_compulsory DESC, name ASC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function getSubject(id) {
  try {
    const result = db.exec("SELECT * FROM subjects WHERE id=?", [id]);
    if (result.length === 0) return { success: false, error: 'Subject not found' };
    const obj = {};
    result[0].columns.forEach((c, i) => obj[c] = result[0].values[0][i]);
    return { success: true, data: obj };
  } catch (e) { return handleError(e); }
}

function saveSubjectRegistrations(data) {
  try {
    const { student_id, subject_ids, session, school_id } = data;
    const sidVal = school_id || null;
    db.run("DELETE FROM subject_registrations WHERE student_id=? AND session=?", [student_id, session]);
    const insert = db.prepare("INSERT INTO subject_registrations (student_id, subject_id, session, school_id) VALUES (?, ?, ?, ?)");
    for (const sid of subject_ids) {
      insert.run([student_id, sid, session, sidVal]);
    }
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function bulkSubjectRegistration(data) {
  try {
    const { class_name, faculty, subject_ids, session, school_id } = data;
    const sidVal = school_id || null;
    let sql = "SELECT id FROM students WHERE class=? AND session=?";
    const params = [class_name, session];
    if (faculty && faculty !== 'Common') { sql += " AND faculty=?"; params.push(faculty); }
    if (sidVal) { sql += " AND school_id=?"; params.push(sidVal); }
    const students = db.exec(sql, params);
    if (!students.length) return { success: true, count: 0 };
    const studentIds = students[0].values.map(r => r[0]);
    const del = db.prepare("DELETE FROM subject_registrations WHERE student_id=? AND session=?");
    const insert = db.prepare("INSERT INTO subject_registrations (student_id, subject_id, session, school_id) VALUES (?, ?, ?, ?)");
    db.run('BEGIN TRANSACTION');
    for (const sid of studentIds) {
      del.run([sid, session]);
      for (const subjId of subject_ids) {
        insert.run([sid, subjId, session, sidVal]);
      }
    }
    db.run('COMMIT');
    saveDatabase();
    return { success: true, count: studentIds.length };
  } catch (e) { db.run('ROLLBACK'); return handleError(e); }
}

function getSubjectRegistrations(student_id, session) {
  try {
    if (student_id === 'all') {
      const sf = schoolFilter('sr');
      const sql = `SELECT sr.student_id, sr.subject_id FROM subject_registrations sr WHERE sr.session=?${sf.sql}`;
      const result = db.exec(sql, [session, ...sf.params]);
      return { success: true, data: result.length > 0 ? result[0].values.map(r => ({ student_id: r[0], subject_id: r[1] })) : [] };
    }
    const result = db.exec("SELECT subject_id FROM subject_registrations WHERE student_id=? AND session=?", [student_id, session]);
    return { success: true, data: result.length > 0 ? result[0].values.map(r => r[0]) : [] };
  } catch (e) { return handleError(e); }
}

function calcGrade(marks, fullMarks, passMarks) {
  const m = parseFloat(marks) || 0;
  const fm = parseFloat(fullMarks) || 0;
  const pm = parseFloat(passMarks) || 0;
  if (fm === 0) return { grade: 'NG', gp: 0 };
  if (m < pm) return { grade: 'NG', gp: 0 };
  const pct = (m / fm) * 100;
  if (pct >= 90) return { grade: 'A+', gp: 4.0 };
  if (pct >= 80) return { grade: 'A', gp: 3.6 };
  if (pct >= 70) return { grade: 'B+', gp: 3.2 };
  if (pct >= 60) return { grade: 'B', gp: 2.8 };
  if (pct >= 50) return { grade: 'C+', gp: 2.4 };
  if (pct >= 40) return { grade: 'C', gp: 2.0 };
  if (pct >= 35) return { grade: 'D', gp: 1.6 };
  return { grade: 'E', gp: 0 };
}

function saveMarks(data) {
  try {
    const { student_id, subject_id, exam_type, session, theory_marks, practical_marks } = data;
    const subjResult = db.exec("SELECT * FROM subjects WHERE id=?", [subject_id]);
    if (subjResult.length === 0) return { success: false, error: 'Subject not found' };
    const subj = {};
    subjResult[0].columns.forEach((c, i) => subj[c] = subjResult[0].values[0][i]);

    const isTerm = exam_type === 'term1' || exam_type === 'term2';
    const tMax = isTerm ? (exam_type === 'term1' ? subj.term1_full_marks : subj.term2_full_marks) : subj.full_marks_theory;
    const pMax = isTerm ? 0 : subj.full_marks_practical;
    const tPass = isTerm ? (exam_type === 'term1' ? subj.term1_pass_marks : subj.term2_pass_marks) : subj.pass_marks_theory;
    const pPass = isTerm ? 0 : subj.pass_marks_practical;

    // Separate grades
    const theoryRes = calcGrade(theory_marks, tMax, tPass);
    const practicalRes = calcGrade(practical_marks, pMax, pPass);

    // Combined grade (fail if either component fails)
    let gp = 0, grade = 'NG';
    if (theoryRes.grade === 'NG' || practicalRes.grade === 'NG') {
      gp = 0; grade = 'NG';
    } else {
      const total = (parseFloat(theory_marks) || 0) + (parseFloat(practical_marks) || 0);
      const fullTotal = (tMax || 0) + (pMax || 0);
      const pct = fullTotal > 0 ? (total / fullTotal) * 100 : 0;
      const combined = calcGrade(total, fullTotal, tPass + pPass);
      gp = combined.gp; grade = combined.grade;
    }

    db.run(`INSERT OR REPLACE INTO marks (student_id, subject_id, exam_type, theory_marks, practical_marks,
            grade_point, grade, theory_grade, theory_grade_point, practical_grade, practical_grade_point, session)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [student_id, subject_id, exam_type, theory_marks, practical_marks, gp, grade,
       theoryRes.grade, theoryRes.gp, practicalRes.grade, practicalRes.gp, session]);
    saveDatabase();
    return { success: true, grade_point: gp, grade: grade,
      theory_grade: theoryRes.grade, theory_grade_point: theoryRes.gp,
      practical_grade: practicalRes.grade, practical_grade_point: practicalRes.gp };
  } catch (e) { return handleError(e); }
}

function getMarks(query) {
  try {
    let sql = `SELECT m.*, s.name as subject_name, s.code as subject_code,
               s.full_marks_theory, s.full_marks_practical,
               s.pass_marks_theory, s.pass_marks_practical, s.credit_hours,
               s.credit_th, s.credit_in,
               s.term1_full_marks, s.term1_pass_marks, s.term1_credit_hours,
               s.term2_full_marks, s.term2_pass_marks, s.term2_credit_hours
               FROM marks m JOIN subjects s ON m.subject_id = s.id WHERE 1=1`;
    const params = [];
    if (query.student_id) { sql += " AND m.student_id=?"; params.push(query.student_id); }
    if (query.session) { sql += " AND m.session=?"; params.push(query.session); }
    if (query.exam_type) { sql += " AND m.exam_type=?"; params.push(query.exam_type); }
    if (query.school_id) { sql += " AND m.school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY s.is_compulsory DESC, s.name ASC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function processResult(data) {
  try {
    const { student_id, session, exam_type } = data;
    const stResult = db.exec("SELECT * FROM students WHERE id=?", [student_id]);
    if (stResult.length === 0) return { success: false, error: 'Student not found' };
    const student = {};
    stResult[0].columns.forEach((c, i) => student[c] = stResult[0].values[0][i]);

    const marksResult = db.exec(
      `SELECT m.*, s.credit_hours, s.full_marks_theory, s.full_marks_practical,
              s.term1_credit_hours, s.term2_credit_hours
       FROM marks m JOIN subjects s ON m.subject_id = s.id
       WHERE m.student_id=? AND m.session=? AND m.exam_type=?`,
      [student_id, session, exam_type || 'final']);
    if (marksResult.length === 0) return { success: false, error: 'No marks found' };
    const marks = marksResult[0].values.map(row => {
      const obj = {};
      marksResult[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    });
    const isTerm = exam_type === 'term1' || exam_type === 'term2';
    let totalTheory = 0, totalPractical = 0, grandTotal = 0;
    let totalCreditHours = 0, weightedGP = 0;
    let hasFail = false, hasNG = false;
    marks.forEach(m => {
      const t = parseFloat(m.theory_marks) || 0;
      const p = parseFloat(m.practical_marks) || 0;
      totalTheory += t;
      totalPractical += p;
      grandTotal += t + p;
      const ch = isTerm ? (exam_type === 'term1' ? parseFloat(m.term1_credit_hours) : parseFloat(m.term2_credit_hours)) : parseFloat(m.credit_hours);
      totalCreditHours += ch || 1;
      const gp = isTerm ? (parseFloat(m.theory_grade_point) || 0) : (parseFloat(m.grade_point) || 0);
      weightedGP += gp * (ch || 1);
      const g = isTerm ? m.theory_grade : m.grade;
      if (g === 'NG' || g === 'E') hasFail = true;
      if (g === 'NG') hasNG = true;
    });
    const gpa = totalCreditHours > 0 ? (weightedGP / totalCreditHours) : 0;
    const roundedGPA = Math.round(gpa * 100) / 100;
    let grade = 'NG';
    let status = 'Pass';
    if (hasNG) { grade = 'NG'; status = 'Fail'; }
    else if (hasFail) { grade = 'E'; status = 'Supplementary'; }
    else if (roundedGPA >= 3.6) { grade = 'A+'; status = 'Pass'; }
    else if (roundedGPA >= 3.2) { grade = 'A'; status = 'Pass'; }
    else if (roundedGPA >= 2.8) { grade = 'B+'; status = 'Pass'; }
    else if (roundedGPA >= 2.4) { grade = 'B'; status = 'Pass'; }
    else if (roundedGPA >= 2.0) { grade = 'C+'; status = 'Pass'; }
    else if (roundedGPA >= 1.6) { grade = 'C'; status = 'Pass'; }
    else if (roundedGPA >= 1.0) { grade = 'D'; status = 'Pass'; }
    else { grade = 'E'; status = 'Fail'; }
    db.run(`INSERT OR REPLACE INTO results
            (student_id, session, class, faculty, exam_type, total_theory, total_practical,
             grand_total, total_credit_hours, weighted_grade_points, gpa, grade, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [student_id, session, student.class, student.faculty, exam_type || 'final',
       totalTheory, totalPractical, grandTotal, totalCreditHours, weightedGP, roundedGPA, grade, status]);
    const rankResult = db.exec(
      `SELECT id FROM results WHERE session=? AND class=? AND faculty=? AND exam_type=?
       ORDER BY gpa DESC, grand_total DESC`, [session, student.class, student.faculty, exam_type || 'final']);
    if (rankResult.length > 0) {
      rankResult[0].values.forEach((row, idx) => {
        db.run("UPDATE results SET rank=? WHERE id=?", [idx + 1, row[0]]);
      });
    }
    saveDatabase();
    return { success: true, gpa: roundedGPA, grade, status, grand_total: grandTotal };
  } catch (e) { return handleError(e); }
}

function getResults(query) {
  try {
    let sql = `SELECT r.*, st.name as student_name, st.roll_no, st.class, st.faculty, st.session
               FROM results r JOIN students st ON r.student_id = st.id WHERE 1=1`;
    const params = [];
    if (query.student_id) { sql += " AND r.student_id=?"; params.push(query.student_id); }
    if (query.session) { sql += " AND r.session=?"; params.push(query.session); }
    if (query.class) { sql += " AND r.class=?"; params.push(query.class); }
    if (query.faculty) { sql += " AND r.faculty=?"; params.push(query.faculty); }
    if (query.exam_type) { sql += " AND r.exam_type=?"; params.push(query.exam_type); }
    if (query.school_id) { sql += " AND r.school_id=?"; params.push(query.school_id); }
    sql += " ORDER BY r.rank ASC";
    const result = db.exec(sql, params);
    return { success: true, data: result.length > 0 ? result[0].values.map(row => {
      const obj = {};
      result[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [] };
  } catch (e) { return handleError(e); }
}

function exportJSON(type) {
  try {
    let data;
    if (type === 'students') {
      data = db.exec("SELECT * FROM students");
    } else if (type === 'subjects') {
      data = db.exec("SELECT * FROM subjects");
    } else if (type === 'marks') {
      data = db.exec("SELECT * FROM marks");
    } else if (type === 'results') {
      data = db.exec("SELECT * FROM results");
    } else {
      data = {
        students: db.exec("SELECT * FROM students"),
        subjects: db.exec("SELECT * FROM subjects"),
        marks: db.exec("SELECT * FROM marks"),
        results: db.exec("SELECT * FROM results"),
        settings: db.exec("SELECT * FROM settings")
      };
    }
    return { success: true, data };
  } catch (e) { return handleError(e); }
}

function importJSON(jsonData) {
  try {
    if (jsonData.students) {
      jsonData.students.forEach(s => {
        db.run(`INSERT OR REPLACE INTO students (id, name, roll_no, class, faculty, session, gender, dob,
                guardian_name, address, phone) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [s.id, s.name, s.roll_no, s.class, s.faculty, s.session, s.gender, s.dob, s.guardian_name, s.address, s.phone]);
      });
    }
    if (jsonData.subjects) {
      jsonData.subjects.forEach(s => {
        db.run(`INSERT OR REPLACE INTO subjects (id, name, code, class, faculty, full_marks_theory,
                full_marks_practical, pass_marks_theory, pass_marks_practical, credit_hours, is_compulsory)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [s.id, s.name, s.code, s.class, s.faculty, s.full_marks_theory, s.full_marks_practical,
           s.pass_marks_theory, s.pass_marks_practical, s.credit_hours, s.is_compulsory]);
      });
    }
    if (jsonData.marks) {
      jsonData.marks.forEach(m => {
        db.run(`INSERT OR REPLACE INTO marks (id, student_id, subject_id, exam_type, theory_marks,
                practical_marks, grade_point, grade, session) VALUES (?,?,?,?,?,?,?,?,?)`,
          [m.id, m.student_id, m.subject_id, m.exam_type, m.theory_marks, m.practical_marks,
           m.grade_point, m.grade, m.session]);
      });
    }
    if (jsonData.results) {
      jsonData.results.forEach(r => {
        db.run(`INSERT OR REPLACE INTO results (id, student_id, session, class, faculty, exam_type,
                total_theory, total_practical, grand_total, total_credit_hours, weighted_grade_points,
                gpa, grade, status, rank) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [r.id, r.student_id, r.session, r.class, r.faculty, r.exam_type, r.total_theory, r.total_practical,
           r.grand_total, r.total_credit_hours, r.weighted_grade_points, r.gpa, r.grade, r.status, r.rank]);
      });
    }
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function getSetting(key) {
  try {
    const result = db.exec("SELECT value FROM settings WHERE key=?", [key]);
    return { success: true, value: result.length > 0 ? result[0].values[0][0] : null };
  } catch (e) { return handleError(e); }
}

function getAllSettings() {
  try {
    const result = db.exec("SELECT key, value FROM settings");
    const data = {};
    if (result.length > 0) {
      result[0].values.forEach(row => { data[row[0]] = row[1]; });
    }
    return { success: true, data };
  } catch (e) { return handleError(e); }
}

function setSetting(key, value) {
  try {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, String(value)]);
    saveDatabase();
    return { success: true };
  } catch (e) { return handleError(e); }
}

function backupDatabase() {
  try {
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}.sqlite`);
    const data = db.export();
    fs.writeFileSync(backupPath, Buffer.from(data));
    return { success: true, path: backupPath };
  } catch (e) { return handleError(e); }
}

// ──────────────────────────────────────────────
// Google Drive Backup System
// ──────────────────────────────────────────────

// OAuth scopes — file-level access only
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// ─── Helper: encrypt/decrypt tokens ───
function driveEncrypt(text) {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString('base64');
  }
  return text;
}
function driveDecrypt(encrypted) {
  if (safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')); } catch (e) { return null; }
  }
  return encrypted;
}

// ─── Helper: get/set drive settings ───
function driveGetSetting(key) {
  const r = db.exec("SELECT value FROM settings WHERE key=?", [`drive_${key}`]);
  return r.length ? r[0].values[0][0] : null;
}
function driveSetSetting(key, value) {
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [`drive_${key}`, String(value)]);
}

// ─── Token helpers ───
function driveStoreTokens(tokens) {
  driveSetSetting('access_token', driveEncrypt(tokens.access_token));
  driveSetSetting('refresh_token', driveEncrypt(tokens.refresh_token || ''));
  driveSetSetting('token_expiry', String(tokens.expiry_date || 0));
  saveDatabase();
}
function driveGetTokens() {
  const at = driveGetSetting('access_token');
  if (!at) return null;
  return {
    access_token: driveDecrypt(at),
    refresh_token: driveDecrypt(driveGetSetting('refresh_token') || ''),
    expiry_date: parseInt(driveGetSetting('token_expiry') || '0', 10)
  };
}
function driveClearTokens() {
  ['access_token','refresh_token','token_expiry','user_email'].forEach(k => {
    db.run("DELETE FROM settings WHERE key=?", [`drive_${k}`]);
  });
  saveDatabase();
  driveAuthClient = null;
}
function driveIsConnected() {
  return !!driveGetSetting('access_token');
}

// ─── Get or create OAuth2 client ───
const DRIVE_DEFAULT_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const DRIVE_DEFAULT_CLIENT_SECRET = 'YOUR_CLIENT_SECRET';

function driveGetClientConfig() {
  return {
    clientId: driveGetSetting('client_id') || DRIVE_DEFAULT_CLIENT_ID,
    clientSecret: driveGetSetting('client_secret') || DRIVE_DEFAULT_CLIENT_SECRET,
    redirectUri: driveGetSetting('redirect_uri') || 'http://localhost:58423'
  };
}

function driveCreateOAuth2Client(redirectUri) {
  const cfg = driveGetClientConfig();
  return new driveAuth.OAuth2(
    cfg.clientId, cfg.clientSecret, redirectUri || cfg.redirectUri
  );
}

// ─── Refresh access token ───
async function driveRefreshAccessToken() {
  try {
    const tokens = driveGetTokens();
    if (!tokens) throw new Error('No tokens');
    const oauth2 = driveCreateOAuth2Client();
    oauth2.setCredentials(tokens);
    const { credentials } = await oauth2.refreshAccessToken();
    driveStoreTokens(credentials);
    return credentials;
  } catch (e) {
    driveClearTokens();
    throw e;
  }
}

// ─── Get authenticated Drive client ───
async function driveGetAuthClient() {
  if (driveAuthClient) return driveAuthClient;
  const tokens = driveGetTokens();
  if (!tokens) throw new Error('Not connected to Google Drive');

  const oauth2 = driveCreateOAuth2Client();
  oauth2.setCredentials(tokens);

  // Check expiry (5min buffer)
  if (tokens.expiry_date && Date.now() > tokens.expiry_date - 300000) {
    try {
      const newTokens = await driveRefreshAccessToken();
      oauth2.setCredentials(newTokens);
    } catch (e) {
      throw new Error('Google Drive session expired. Reconnect.');
    }
  }

  driveAuthClient = drive({ version: 'v3', auth: oauth2 });
  return driveAuthClient;
}

// ─── Create backup zip (in memory) ───
async function createBackupZip() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dbBuffer = Buffer.from(db.export());
  const zip = new JSZip();
  zip.file('database.sqlite', dbBuffer);
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { zipBuffer, timestamp };
}

// ─── Export per-school JSON data ───
function exportPerSchoolData() {
  const schools = db.exec("SELECT id, name FROM schools");
  if (!schools.length) return [];
  const result = [];
  schools[0].values.forEach(row => {
    const schoolId = row[0];
    const schoolName = (row[1] || 'school').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const data = {};
    const tables = [
      { name: 'students', cols: '*' },
      { name: 'subjects', cols: '*' },
      { name: 'teachers', cols: '*' },
      { name: 'staff', cols: '*' },
      { name: 'sections', cols: '*' },
      { name: 'routines', cols: '*' },
      { name: 'attendance', cols: '*' },
      { name: 'fee_setup', cols: '*' },
      { name: 'fee_collections', cols: '*' },
      { name: 'books', cols: '*' },
      { name: 'book_issues', cols: '*' },
      { name: 'subject_registrations', cols: '*' },
      { name: 'marks', cols: '*' },
      { name: 'results', cols: '*' }
    ];
    tables.forEach(t => {
      try {
        const r = db.exec(`SELECT ${t.cols} FROM ${t.name} WHERE school_id=?`, [schoolId]);
        if (r.length && r[0].values.length) {
          data[t.name] = { columns: r[0].columns, values: r[0].values };
        }
      } catch (e) { /* table might not exist */ }
    });
    result.push({ schoolId, schoolName, data, timestamp: new Date().toISOString() });
  });
  return result;
}

// ─── Ensure Drive backup folders exist ───
async function driveEnsureFolders(driveClient) {
  const rootName = 'NEB-Backups';
  const subFolders = { full: null, perSchool: null };

  async function findOrCreate(parentId, name) {
    const q = `name='${name.replace(/'/g,"\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const list = await driveClient.files.list({ q: parentId ? `${q} and '${parentId}' in parents` : q, fields: 'files(id,name)', pageSize: 1 });
    if (list.data.files.length) return list.data.files[0].id;
    const res = await driveClient.files.create({
      fields: 'id',
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] }
    });
    return res.data.id;
  }

  const rootId = await findOrCreate(null, rootName);
  subFolders.full = await findOrCreate(rootId, 'full');
  subFolders.perSchool = await findOrCreate(rootId, 'per-school');
  return subFolders;
}

// ─── Upload a file to Drive ───
async function driveUpload(driveClient, folderId, fileName, data, mimeType) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  const readable = new stream.Readable();
  readable.push(body);
  readable.push(null);
  const res = await driveClient.files.create({
    fields: 'id,name,createdTime',
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: mimeType || 'application/octet-stream', body: readable }
  });
  return res.data;
}

// ─── Delete a single backup file from Drive ───
async function driveDeleteFile(fileId) {
  let driveClient;
  try {
    driveClient = await driveGetAuthClient();
  } catch (e) {
    return { success: false, error: e.message };
  }
  try {
    await driveClient.files.delete({ fileId });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Download a backup file from Drive to local ───
async function driveDownloadFile(fileId, savePath) {
  let driveClient;
  try {
    driveClient = await driveGetAuthClient();
  } catch (e) {
    return { success: false, error: e.message };
  }
  try {
    const res = await driveClient.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const buf = Buffer.from(res.data);
    fs.writeFileSync(savePath, buf);
    return { success: true, path: savePath, size: buf.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Delete old backups (keep last N) ───
async function driveDeleteOldBackups(driveClient, folderId, keepCount) {
  const list = await driveClient.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,createdTime)',
    orderBy: 'createdTime desc',
    pageSize: 100
  });
  const files = list.data.files || [];
  if (files.length <= keepCount) return;
  const toDelete = files.slice(keepCount);
  for (const f of toDelete) {
    try { await driveClient.files.delete({ fileId: f.id }); } catch (e) { /* skip */ }
  }
}

// ─── List backup files from Drive ───
async function driveListBackups(driveClient) {
  const folders = await driveEnsureFolders(driveClient);
  const result = { full: [], perSchool: [] };
  const listFiles = async (folderId) => {
    const list = await driveClient.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,createdTime,size)',
      orderBy: 'createdTime desc',
      pageSize: 50
    });
    return list.data.files || [];
  };
  result.full = await listFiles(folders.full);
  result.perSchool = await listFiles(folders.perSchool);
  return result;
}

// ─── MAIN: Run full backup ───
async function driveRunBackup() {
  const connected = driveIsConnected();
  if (!connected) return { success: false, error: 'Not connected to Google Drive' };

  let driveClient;
  try {
    driveClient = await driveGetAuthClient();
  } catch (e) {
    return { success: false, error: e.message };
  }

  try {
    const folders = await driveEnsureFolders(driveClient);
    const { zipBuffer, timestamp } = await createBackupZip();
    const dateStr = timestamp.slice(0, 10);
    const timeStr = timestamp.slice(11, 19).replace(/:/g, '-');

    // Upload full DB zip
    const zipName = `database-${dateStr}-${timeStr}.zip`;
    const fullFile = await driveUpload(driveClient, folders.full, zipName, zipBuffer, 'application/zip');

    // Upload per-school JSONs
    const schools = exportPerSchoolData();
    const perSchoolFiles = [];
    for (const school of schools) {
      const jsonStr = JSON.stringify(school.data, null, 2);
      const jsonName = `school-${school.schoolId}-${school.schoolName}-${dateStr}.json`;
      const file = await driveUpload(driveClient, folders.perSchool, jsonName, jsonStr, 'application/json');
      perSchoolFiles.push({ schoolId: school.schoolId, fileId: file.id, fileName: file.name });
    }

    // Clean old backups (keep configured count)
    const keepCount = parseInt(driveGetSetting('keep_count') || '30', 10);
    await driveDeleteOldBackups(driveClient, folders.full, keepCount);
    await driveDeleteOldBackups(driveClient, folders.perSchool, keepCount);

    // Update history
    const now = new Date().toISOString();
    const history = JSON.parse(driveGetSetting('backup_history') || '[]');
    history.unshift({ timestamp: now, fullFile: { id: fullFile.id, name: fullFile.name }, perSchoolFiles });
    if (history.length > 50) history.length = 50;
    driveSetSetting('backup_history', JSON.stringify(history));
    driveSetSetting('last_backup', now);
    saveDatabase();

    // Stop/restart timer to reset interval
    driveStopAutoBackup();
    driveStartAutoBackup();

    return { success: true, timestamp: now, fullFile: fullFile.name, schools: perSchoolFiles.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── OAuth: Start system browser flow ───
async function driveInitOAuth() {
  return new Promise((resolve) => {
    const cfg = driveGetClientConfig();
    if (!cfg.clientId) {
      resolve({ success: false, error: 'Google Client ID not configured. Enter it in Settings > Backup.' });
      return;
    }

    // Start loopback server
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.query.code && parsed.query.state) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h3>✅ Connected! You may close this window.</h3></body></html>');
        server.close();
        oauthServer = null;
        driveHandleCallback(parsed.query.code, parsed.query.state, parsed.query.redirect_uri)
          .then(r => resolve(r))
          .catch(e => resolve({ success: false, error: e.message }));
      } else if (parsed.query.error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body><h3>❌ ${parsed.query.error}</h3></body></html>`);
        server.close();
        oauthServer = null;
        resolve({ success: false, error: parsed.query.error_description || parsed.query.error });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    // Find available port
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      oauthServer = server;
      const redirectUri = `http://127.0.0.1:${port}`;
      const state = crypto.randomBytes(16).toString('hex');

      // Save redirect URI so callback can find it
      driveSetSetting('redirect_uri', redirectUri);
      driveSetSetting('oauth_state', state);
      saveDatabase();

      const oauth2 = driveCreateOAuth2Client(redirectUri);
      const authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        scope: DRIVE_SCOPES,
        state,
        prompt: 'consent'
      });
      shell.openExternal(authUrl);
    });

    server.on('error', (e) => {
      oauthServer = null;
      resolve({ success: false, error: e.message });
    });
  });
}

// ─── Handle OAuth callback ───
async function driveHandleCallback(code, state, redirectUri) {
  const savedState = driveGetSetting('oauth_state');
  if (state && savedState && state !== savedState) {
    return { success: false, error: 'State mismatch. Possible CSRF.' };
  }
  try {
    const savedRedirect = redirectUri || driveGetSetting('redirect_uri') || 'http://localhost:58423';
    const oauth2 = driveCreateOAuth2Client(savedRedirect);
    const { tokens } = await oauth2.getToken(code);
    driveStoreTokens(tokens);

    // Get user email
    try {
      const authDrive = drive({ version: 'v3', auth: oauth2 });
      const about = await authDrive.about.get({ fields: 'user' });
      driveSetSetting('user_email', about.data.user.emailAddress || '');
    } catch (e) { /* non-critical */ }
    saveDatabase();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Disconnect from Google Drive ───
function driveDisconnect() {
  driveStopAutoBackup();
  driveClearTokens();
  return { success: true };
}

// ─── Get connection + backup status ───
function driveGetStatus() {
  const connected = driveIsConnected();
  const email = driveGetSetting('user_email') || '';
  const lastBackup = driveGetSetting('last_backup') || '';
  const autoBackup = driveGetSetting('auto_backup') === '1';
  const interval = parseInt(driveGetSetting('interval_ms') || '86400000', 10);
  const keepCount = parseInt(driveGetSetting('keep_count') || '30', 10);
  const history = JSON.parse(driveGetSetting('backup_history') || '[]');
  const clientConfigured = !!(driveGetSetting('client_id') || DRIVE_DEFAULT_CLIENT_ID);
  const userSchoolId = currentUser ? currentUser.school_id : null;
  const isSuperAdmin = currentUser ? currentUser.role === 'super_admin' : false;
  return {
    success: true,
    connected,
    email,
    lastBackup,
    autoBackup,
    interval,
    keepCount,
    history,
    clientConfigured,
    clientId: driveGetSetting('client_id') || '',
    userSchoolId,
    isSuperAdmin,
    userRole: currentUser ? currentUser.role : null
  };
}

// ─── Update backup settings ───
function driveSetSettings(opts) {
  if (opts.clientId !== undefined) driveSetSetting('client_id', opts.clientId);
  if (opts.clientSecret !== undefined) driveSetSetting('client_secret', opts.clientSecret);
  if (opts.autoBackup !== undefined) {
    driveSetSetting('auto_backup', opts.autoBackup ? '1' : '0');
    if (opts.autoBackup) {
      driveStartAutoBackup();
    } else {
      driveStopAutoBackup();
    }
  }
  if (opts.intervalMs !== undefined) {
    driveSetSetting('interval_ms', String(opts.intervalMs));
    if (driveGetSetting('auto_backup') === '1') {
      driveStopAutoBackup();
      driveStartAutoBackup();
    }
  }
  if (opts.keepCount !== undefined) driveSetSetting('keep_count', String(opts.keepCount));
  saveDatabase();
  return { success: true };
}

// ─── Auto-backup timer ───
function driveStartAutoBackup() {
  driveStopAutoBackup();
  if (driveGetSetting('auto_backup') !== '1') return;
  if (!driveIsConnected()) return;
  const interval = parseInt(driveGetSetting('interval_ms') || '86400000', 10);
  // First backup after 5 min delay (to let app fully load)
  setTimeout(() => {
    driveRunBackup();
    driveBackupTimer = setInterval(() => { driveRunBackup(); }, interval);
  }, 300000);
}
function driveStopAutoBackup() {
  if (driveBackupTimer) { clearInterval(driveBackupTimer); driveBackupTimer = null; }
}

// ─── Restore full backup from Drive ───
async function driveRestoreFullBackup(fileId) {
  let driveClient;
  try {
    driveClient = await driveGetAuthClient();
  } catch (e) {
    return { success: false, error: e.message };
  }
  try {
    const res = await driveClient.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const buf = Buffer.from(res.data);
    // Save to a temp path first, then replace on restart
    const restorePath = path.join(DATA_DIR, 'restore_temp.sqlite');
    fs.writeFileSync(restorePath, buf);
    return { success: true, path: restorePath, requiresRestart: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Restore per-school data from Drive JSON ───
async function driveRestoreSchoolBackup(fileId, schoolId) {
  let driveClient;
  try {
    driveClient = await driveGetAuthClient();
  } catch (e) {
    return { success: false, error: e.message };
  }
  try {
    const res = await driveClient.files.get({ fileId, alt: 'media' }, { responseType: 'json' });
    const jsonData = res.data;
    if (!jsonData) return { success: false, error: 'Empty backup data' };

    // Delete existing data for this school
    const tables = ['students','subjects','teachers','staff','sections','routines','attendance',
                    'fee_setup','fee_collections','books','book_issues','subject_registrations','marks','results'];
    tables.forEach(t => {
      try { db.run(`DELETE FROM ${t} WHERE school_id=?`, [schoolId]); } catch (e) { /* skip */ }
    });

    // Import data from JSON
    let imported = 0;
    tables.forEach(t => {
      const tableData = jsonData[t];
      if (!tableData || !tableData.values || !tableData.columns) return;
      const cols = tableData.columns.join(',');
      const placeholders = tableData.columns.map(() => '?').join(',');
      tableData.values.forEach(row => {
        try {
          db.run(`INSERT INTO ${t} (${cols}) VALUES (${placeholders})`, row);
          imported++;
        } catch (e) { /* skip row on error */ }
      });
    });

    saveDatabase();
    return { success: true, imported };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Helper: apply pending full restore ───
function driveApplyFullRestore() {
  const restorePath = path.join(DATA_DIR, 'restore_temp.sqlite');
  if (!fs.existsSync(restorePath)) return;
  try {
    const buf = fs.readFileSync(restorePath);
    fs.writeFileSync(DB_PATH, buf);
    fs.unlinkSync(restorePath);
  } catch (e) {
    console.error('Failed to apply restore:', e);
  }
}

function addSchoolIdToQuery(query) {
  if (!query) query = {};
  const sf = schoolFilter();
  if (sf.params.length) query.school_id = sf.params[0];
  return query;
}

function getSchoolIdFromSession() {
  const sf = schoolFilter();
  return sf.params.length ? sf.params[0] : null;
}

// Auth
ipcMain.handle('auth:login', async (e, username, password) => login(username, password));
ipcMain.handle('auth:logout', async () => logout());
ipcMain.handle('auth:getCurrentUser', async () => getCurrentUser());
ipcMain.handle('auth:changePassword', async (e, userId, currentPw, newPw) => changePassword(userId, currentPw, newPw));
ipcMain.handle('auth:switchSchool', async (e, schoolId) => switchSchool(schoolId));

// Schools
ipcMain.handle('schools:getAll', async () => getSchools());
ipcMain.handle('schools:get', async (e, id) => getSchool(id));
ipcMain.handle('schools:add', async (e, data) => addSchool(data));
ipcMain.handle('schools:update', async (e, id, data) => updateSchool(id, data));
ipcMain.handle('schools:delete', async (e, id) => deleteSchool(id));

// Users
ipcMain.handle('users:getAll', async (e, schoolId) => getUsers(schoolId));
ipcMain.handle('users:add', async (e, data) => addUser(data));
ipcMain.handle('users:update', async (e, id, data) => updateUser(id, data));
ipcMain.handle('users:delete', async (e, id) => deleteUser(id));

// Dashboard
ipcMain.handle('db:getGlobalDashboard', async () => getGlobalDashboardStats());

// Existing handlers (with school_id injection)
ipcMain.handle('db:addStudent', async (e, data) => addStudent({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:updateStudent', async (e, id, data) => updateStudent(id, data));
ipcMain.handle('db:deleteStudent', async (e, id) => deleteStudent(id));
ipcMain.handle('db:deleteMultipleStudents', async (e, ids) => deleteMultipleStudents(ids));
ipcMain.handle('db:getStudents', async (e, query) => getStudents(addSchoolIdToQuery(query)));
ipcMain.handle('db:getStudent', async (e, id) => getStudent(id));
ipcMain.handle('db:addSubject', async (e, data) => addSubject({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:updateSubject', async (e, id, data) => updateSubject(id, data));
ipcMain.handle('db:deleteSubject', async (e, id) => deleteSubject(id));
ipcMain.handle('db:deleteMultipleSubjects', async (e, ids) => deleteMultipleSubjects(ids));
ipcMain.handle('db:getSubjects', async (e, query) => getSubjects(addSchoolIdToQuery(query)));
ipcMain.handle('db:getSubject', async (e, id) => getSubject(id));
ipcMain.handle('db:addTeacher', async (e, data) => addTeacher({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:updateTeacher', async (e, id, data) => updateTeacher(id, data));
ipcMain.handle('db:deleteTeacher', async (e, id) => deleteTeacher(id));
ipcMain.handle('db:deleteMultipleTeachers', async (e, ids) => deleteMultipleTeachers(ids));
ipcMain.handle('db:getTeachers', async (e, query) => getTeachers(addSchoolIdToQuery(query)));
ipcMain.handle('db:getTeacher', async (e, id) => getTeacher(id));
ipcMain.handle('db:addStaff', async (e, data) => addStaff({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:updateStaff', async (e, id, data) => updateStaff(id, data));
ipcMain.handle('db:deleteStaff', async (e, id) => deleteStaff(id));
ipcMain.handle('db:deleteMultipleStaff', async (e, ids) => deleteMultipleStaff(ids));
ipcMain.handle('db:getStaffList', async (e, query) => getStaffList(addSchoolIdToQuery(query)));
ipcMain.handle('db:getStaff', async (e, id) => getStaff(id));
ipcMain.handle('db:saveAttendance', async (e, data) => saveAttendance(data.map ? data.map(d => ({ ...d, school_id: getSchoolIdFromSession() })) : data));
ipcMain.handle('db:getAttendance', async (e, query) => getAttendance(addSchoolIdToQuery(query)));
ipcMain.handle('db:getAttendanceStats', async (e, studentId, session) => getAttendanceStats(studentId, session));
ipcMain.handle('db:getSections', async (e, query) => getSections(addSchoolIdToQuery(query)));
ipcMain.handle('db:addSection', async (e, data) => addSection({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:updateSection', async (e, id, data) => updateSection(id, data));
ipcMain.handle('db:deleteSection', async (e, id) => deleteSection(id));
ipcMain.handle('db:getRoutines', async (e, query) => getRoutines(addSchoolIdToQuery(query)));
ipcMain.handle('db:saveRoutines', async (e, data) => saveRoutines({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:getFeeItems', async (e, query) => getFeeItems(addSchoolIdToQuery(query)));
ipcMain.handle('db:addFeeItem', async (e, data) => addFeeItem({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:updateFeeItem', async (e, id, data) => updateFeeItem(id, data));
ipcMain.handle('db:deleteFeeItem', async (e, id) => deleteFeeItem(id));
ipcMain.handle('db:getFeeCollections', async (e, query) => getFeeCollections(addSchoolIdToQuery(query)));
ipcMain.handle('db:saveFeeCollection', async (e, data) => saveFeeCollection({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:getFeeCollectionItems', async (e, id) => getFeeCollectionItems(id));
ipcMain.handle('db:deleteFeeCollection', async (e, id) => deleteFeeCollection(id));
ipcMain.handle('db:getAllSettings', async () => getAllSettings());
ipcMain.handle('db:getBooks', async (e, query) => getBooks(addSchoolIdToQuery(query)));
ipcMain.handle('db:getBook', async (e, id) => getBook(id));
ipcMain.handle('db:saveBook', async (e, data) => saveBook({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:deleteBook', async (e, id) => deleteBook(id));
ipcMain.handle('db:getBookIssues', async (e, query) => getBookIssues(addSchoolIdToQuery(query)));
ipcMain.handle('db:issueBook', async (e, data) => issueBook({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:returnBook', async (e, id, date) => returnBook(id, date));
ipcMain.handle('db:saveSubjectRegistrations', async (e, data) => saveSubjectRegistrations({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:bulkSubjectRegistration', async (e, data) => bulkSubjectRegistration({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:getSubjectRegistrations', async (e, student_id, session) => getSubjectRegistrations(student_id, session));
ipcMain.handle('db:saveMarks', async (e, data) => saveMarks({ ...data, school_id: getSchoolIdFromSession() }));
ipcMain.handle('db:getMarks', async (e, query) => getMarks(addSchoolIdToQuery(query)));
ipcMain.handle('db:processResult', async (e, data) => processResult(data));
ipcMain.handle('db:getResults', async (e, query) => getResults(addSchoolIdToQuery(query)));
ipcMain.handle('db:exportJSON', async (e, type) => exportJSON(type));
ipcMain.handle('db:importJSON', async (e, data) => importJSON(data));
ipcMain.handle('db:getSetting', async (e, key) => getSetting(key));
ipcMain.handle('db:setSetting', async (e, key, value) => setSetting(key, value));
ipcMain.handle('db:backup', async () => backupDatabase());
ipcMain.handle('db:saveLogo', async (e, base64Data) => {
  try {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('school_logo', ?)", [base64Data]);
    saveDatabase();
    return { success: true };
  } catch (err) { return handleError(err); }
});
ipcMain.handle('nepali:bsToAd', async (e, bsDate) => {
  try {
    if (!bsDate || !/^\d{4}-\d{2}-\d{2}$/.test(bsDate)) return { success: false };
    const adStr = BStoAD(bsDate);
    return { success: true, data: adStr };
  } catch (e) { return { success: false, error: e.message }; }
});

// Drive Backup IPC
ipcMain.handle('drive:connect', async () => driveInitOAuth());
ipcMain.handle('drive:disconnect', async () => driveDisconnect());
ipcMain.handle('drive:backupNow', async () => driveRunBackup());
ipcMain.handle('drive:getStatus', async () => driveGetStatus());
ipcMain.handle('drive:setSettings', async (e, opts) => driveSetSettings(opts));
ipcMain.handle('drive:restoreFull', async (e, fileId) => driveRestoreFullBackup(fileId));
ipcMain.handle('drive:restoreSchool', async (e, fileId, schoolId) => driveRestoreSchoolBackup(fileId, schoolId));
ipcMain.handle('drive:deleteFile', async (e, fileId) => driveDeleteFile(fileId));
ipcMain.handle('drive:downloadFile', async (e, fileId, savePath) => driveDownloadFile(fileId, savePath));
ipcMain.handle('util:openExternal', async (e, url) => {
  shell.openExternal(url);
});

ipcMain.handle('drive:applyFullRestore', async () => {
  driveApplyFullRestore();
  return { success: true, requiresRestart: true };
});

ipcMain.handle('dialog:saveFile', async (e, opts) => {
  return dialog.showSaveDialog(mainWindow, opts);
});
ipcMain.handle('dialog:openFile', async (e, opts) => {
  return dialog.showOpenDialog(mainWindow, opts);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'NEB Result Management System - Class 11 & 12',
    icon: path.join(__dirname, 'src', 'assets', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  ensureDataDir();
  driveApplyFullRestore();
  await initDatabase();
  createWindow();
  driveStartAutoBackup();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

process.on('uncaughtException', () => {});

app.on('window-all-closed', () => {
  if (db) { saveDatabase(); db.close(); db = null; }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (db) { saveDatabase(); db.close(); db = null; }
});
