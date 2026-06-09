const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { initDatabase } = require('./db');

// Routes
const authRoutes = require('./routes/auth');
const schoolRoutes = require('./routes/schools');
const userRoutes = require('./routes/users');
const dataRoutes = require('./routes/data');
const noticeRoutes = require('./routes/notices');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Upload directory
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, unique + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Static files
app.use(express.static(path.join(__dirname, '..', 'src')));
app.use('/uploads', express.static(uploadDir));
app.use('/node_modules', express.static(path.join(__dirname, '..', 'node_modules')));

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, path: `/uploads/${req.file.filename}` });
});

// File upload (base64 / photo_path)
app.post('/api/upload-base64', (req, res) => {
  try {
    const { base64, filename } = req.body;
    if (!base64) return res.json({ success: false, error: 'No data' });
    const matches = base64.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/);
    if (!matches) return res.json({ success: false, error: 'Invalid base64 image' });
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const name = filename || `${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, name);
    fs.writeFileSync(filePath, matches[2], 'base64');
    res.json({ success: true, path: `/uploads/${name}` });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// Public: approved schools for landing page (no auth required)
app.get('/api/schools/approved', async (req, res) => {
  try {
    const { query } = require('./db');
    const rows = await query(
      "SELECT id, name, iemis_id, school_logo, municipality, district, phone, email FROM schools WHERE is_approved=1 ORDER BY name ASC"
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/users', userRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/notices', noticeRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ success: true, message: 'Server running' }));

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.json({ success: false, error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'src', 'index.html'));
});

// Start server
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (e) {
    console.error('Failed to start server:', e);
    process.exit(1);
  }
}

start();

module.exports = app;
