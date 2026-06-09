const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

let db = null;

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function query(sql, params) {
  const r = getDb().exec(sql, params);
  if (!r.length) return [];
  const cols = r[0].columns;
  return r[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => { obj[c] = row[i]; });
    return obj;
  });
}

function querySingle(sql, params) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params) {
  getDb().run(sql, params);
  saveDatabase();
}

function insert(sql, params) {
  const insertSql = sql.trim().replace(/;$/, '') + " RETURNING id";
  const result = getDb().exec(insertSql, params);
  saveDatabase();
  if (result && result[0] && result[0].values && result[0].values[0]) {
    return result[0].values[0][0];
  }
  return 0;
}

function saveDatabase() {
  if (!db) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function initDatabase() {
  await ensureDataDir();
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  createTables();

  // Ensure default admin
  const userCount = db.exec("SELECT COUNT(*) as cnt FROM users", []);
  if (!userCount.length || userCount[0].values[0][0] === 0) {
    db.run("INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)",
      ['admin', 'admin123', 'Super Admin', 'super_admin']);
  }

  // Ensure session setting
  const ses = db.exec("SELECT value FROM settings WHERE key='current_session'");
  if (!ses.length) {
    const year = new Date().getFullYear();
    db.run("INSERT INTO settings (key, value) VALUES ('current_session', ?)", [`${year-1}/${year}`]);
  }

  // Profile defaults
  const profileDefaults = {
    school_name: 'SARASWATI JANATA SECONDARY SCHOOL',
    municipality: 'BELDANDI RURAL MUNICIPALITY - 4, KANCHANPUR',
    province: 'Sudurpashima Province',
    estd: '2017 BS',
    exam_year_bs: '2083',
    exam_year_ad: '2026',
  };
  for (const [k, v] of Object.entries(profileDefaults)) {
    const exists = db.exec("SELECT value FROM settings WHERE key=?", [k]);
    if (!exists.length || !exists[0].values.length) {
      db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [k, v]);
    }
  }

  saveDatabase();
}

function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS schools (
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
    is_approved INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'school_admin',
    school_id INTEGER,
    is_active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    roll_no TEXT NOT NULL,
    sym TEXT,
    reg TEXT,
    class TEXT NOT NULL,
    faculty TEXT NOT NULL,
    session TEXT NOT NULL,
    gender TEXT,
    dob TEXT,
    dob_bs TEXT,
    father_name TEXT DEFAULT '',
    mother_name TEXT DEFAULT '',
    guardian_name TEXT,
    address TEXT,
    phone TEXT,
    photo_path TEXT,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_type TEXT NOT NULL,
    person_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    remarks TEXT,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class TEXT NOT NULL,
    name TEXT NOT NULL,
    class_teacher_id INTEGER,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(class, name)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class TEXT NOT NULL,
    section TEXT,
    day TEXT NOT NULL,
    period INTEGER NOT NULL,
    subject TEXT,
    teacher_id INTEGER,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(class, section, day, period)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS fee_setup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    class TEXT DEFAULT '',
    faculty TEXT DEFAULT '',
    session TEXT NOT NULL,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS fee_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    session TEXT NOT NULL,
    total_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    payment_method TEXT DEFAULT 'Cash',
    remarks TEXT,
    date TEXT NOT NULL,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS fee_collection_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    fee_item_id INTEGER,
    fee_name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (collection_id) REFERENCES fee_collections(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT DEFAULT '',
    publisher TEXT DEFAULT '',
    isbn TEXT DEFAULT '',
    category TEXT DEFAULT '',
    quantity INTEGER DEFAULT 1,
    available_quantity INTEGER DEFAULT 1,
    rack_no TEXT DEFAULT '',
    description TEXT,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS book_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    return_date TEXT,
    status TEXT DEFAULT 'issued',
    remarks TEXT DEFAULT '',
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    class TEXT NOT NULL,
    faculty TEXT NOT NULL DEFAULT 'General',
    full_marks_theory REAL DEFAULT 75,
    full_marks_practical REAL DEFAULT 25,
    pass_marks_theory REAL DEFAULT 27,
    pass_marks_practical REAL DEFAULT 9,
    credit_hours REAL DEFAULT 5,
    is_compulsory INTEGER DEFAULT 1,
    credit_th REAL DEFAULT 3,
    credit_in REAL DEFAULT 2,
    display_seq REAL DEFAULT 0,
    term1_full_marks REAL DEFAULT 0,
    term1_pass_marks REAL DEFAULT 0,
    term1_credit_hours REAL DEFAULT 0,
    term2_full_marks REAL DEFAULT 0,
    term2_pass_marks REAL DEFAULT 0,
    term2_credit_hours REAL DEFAULT 0,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS teachers (
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
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS staff (
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
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS subject_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    session TEXT NOT NULL,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(student_id, subject_id, session),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    exam_type TEXT DEFAULT 'final',
    theory_marks REAL DEFAULT 0,
    practical_marks REAL DEFAULT 0,
    grade_point REAL DEFAULT 0,
    grade TEXT DEFAULT 'NG',
    theory_grade TEXT,
    theory_grade_point REAL,
    practical_grade TEXT,
    practical_grade_point REAL,
    session TEXT NOT NULL,
    school_id INTEGER,
    UNIQUE(student_id, subject_id, exam_type, session),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS results (
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
    status TEXT DEFAULT 'Pass',
    rank INTEGER,
    school_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(student_id, session, exam_type),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // School approval
  try { db.run("ALTER TABLE schools ADD COLUMN is_approved INTEGER DEFAULT 1"); } catch(e) {}
  // Add father_name/mother_name columns to students if missing
  try { db.run("ALTER TABLE students ADD COLUMN father_name TEXT DEFAULT ''"); } catch(e) {}
  try { db.run("ALTER TABLE students ADD COLUMN mother_name TEXT DEFAULT ''"); } catch(e) {}
  // Add subject columns if missing
  try { db.run("ALTER TABLE subjects ADD COLUMN credit_th REAL DEFAULT 3"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN credit_in REAL DEFAULT 2"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN display_seq REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term1_full_marks REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term1_pass_marks REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term1_credit_hours REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term2_full_marks REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term2_pass_marks REAL DEFAULT 0"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN term2_credit_hours REAL DEFAULT 0"); } catch(e) {}
  // Add theory_grade/practical_grade to marks if missing
  try { db.run("ALTER TABLE marks ADD COLUMN theory_grade TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE marks ADD COLUMN theory_grade_point REAL"); } catch(e) {}
  try { db.run("ALTER TABLE marks ADD COLUMN practical_grade TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE marks ADD COLUMN practical_grade_point REAL"); } catch(e) {}
  try { db.run("ALTER TABLE marks ADD COLUMN school_id INTEGER"); } catch(e) {}
  // Add school_id to tables if missing
  try { db.run("ALTER TABLE students ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE subjects ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE teachers ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE staff ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE attendance ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE sections ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE routines ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE fee_setup ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE fee_collections ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE books ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE book_issues ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE subject_registrations ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE results ADD COLUMN school_id INTEGER"); } catch(e) {}

  // Add user columns if missing
  try { db.run("ALTER TABLE users ADD COLUMN school_id INTEGER"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN last_login TEXT"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''"); } catch(e) {}
  try { db.run("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''"); } catch(e) {}
}

module.exports = { query, querySingle, execute, insert, initDatabase, saveDatabase, getDb };
