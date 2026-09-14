require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'wedding123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, 'couple-photo' + ext);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Chỉ chấp nhận file ảnh'));
    cb(null, true);
  }
});

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_PASSWORD) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Chi tra ve nhung truong an toan cho chinh khach do xem, khong lo du lieu cua nguoi khac
function guestPublicView(g) {
  return {
    id: g.id,
    hoTen: g.hoTen,
    ben: g.ben,
    soNguoiMoi: g.soNguoiMoi,
    trangThaiRSVP: g.trangThaiRSVP,
    soNguoiThamDuThucTe: g.soNguoiThamDuThucTe
  };
}

/* ========================= ADMIN API (can mat khau) ========================= */

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'wrong password' });
});

app.get('/api/admin/state', requireAdmin, (req, res) => {
  res.json(db.load());
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const data = db.load();
  const allowed = ['groomName', 'brideName', 'weddingDate', 'eventTime', 'venue', 'rsvpDeadline'];
  allowed.forEach(k => {
    if (req.body && req.body[k] !== undefined) data.settings[k] = req.body[k];
  });
  db.save(data);
  res.json(data.settings);
});

app.post('/api/admin/settings/photo', requireAdmin, (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Không nhận được file ảnh' });
    const data = db.load();
    data.settings.couplePhoto = '/uploads/' + req.file.filename + '?v=' + Date.now();
    db.save(data);
    res.json(data.settings);
  });
});

app.post('/api/admin/guests', requireAdmin, (req, res) => {
  const data = db.load();
  const id = 'KM-' + String(data.nextGuestSeq++).padStart(4, '0');
  const body = req.body || {};
  const g = {
    id,
    hoTen: (body.hoTen || '').toString().trim(),
    ben: body.ben === 'Nhà gái' ? 'Nhà gái' : 'Nhà trai',
    nhom: (body.nhom || '').toString().trim(),
    sdt: (body.sdt || '').toString().trim(),
    email: (body.email || '').toString().trim(),
    soNguoiMoi: Number(body.soNguoiMoi) || 1,
    trangThaiMoi: 'chua_gui',
    trangThaiRSVP: 'chua_phan_hoi',
    soNguoiThamDuThucTe: null,
    banId: '',
    daCheckin: false,
    checkinTime: '',
    ghiChu: (body.ghiChu || '').toString().trim()
  };
  data.guests.push(g);
  db.save(data);
  res.json(g);
});

app.put('/api/admin/guests/:id', requireAdmin, (req, res) => {
  const data = db.load();
  const g = data.guests.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const editable = ['hoTen', 'ben', 'nhom', 'sdt', 'email', 'soNguoiMoi', 'ghiChu', 'trangThaiMoi', 'banId', 'trangThaiRSVP', 'soNguoiThamDuThucTe'];
  editable.forEach(k => { if (req.body && req.body[k] !== undefined) g[k] = req.body[k]; });
  db.save(data);
  res.json(g);
});

app.put('/api/admin/guests/:id/checkin', requireAdmin, (req, res) => {
  const data = db.load();
  const g = data.guests.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  g.daCheckin = !!(req.body && req.body.daCheckin);
  g.checkinTime = g.daCheckin ? new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
  db.save(data);
  res.json(g);
});

app.delete('/api/admin/guests/:id', requireAdmin, (req, res) => {
  const data = db.load();
  data.guests = data.guests.filter(x => x.id !== req.params.id);
  db.save(data);
  res.json({ ok: true });
});

app.post('/api/admin/guests/import', requireAdmin, (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [];
  const data = db.load();
  let added = 0;
  rows.forEach(r => {
    const hoTen = (r.hoTen || '').toString().trim();
    if (!hoTen) return;
    const id = 'KM-' + String(data.nextGuestSeq++).padStart(4, '0');
    data.guests.push({
      id,
      hoTen,
      ben: (r.ben || 'Nhà trai').toString().trim() === 'Nhà gái' ? 'Nhà gái' : 'Nhà trai',
      nhom: (r.nhom || '').toString().trim(),
      sdt: (r.sdt || '').toString().trim(),
      email: (r.email || '').toString().trim(),
      soNguoiMoi: Number(r.soNguoiMoi) || 1,
      trangThaiMoi: 'chua_gui',
      trangThaiRSVP: 'chua_phan_hoi',
      soNguoiThamDuThucTe: null,
      banId: '',
      daCheckin: false,
      checkinTime: '',
      ghiChu: (r.ghiChu || '').toString().trim()
    });
    added++;
  });
  db.save(data);
  res.json({ added });
});

app.post('/api/admin/tables', requireAdmin, (req, res) => {
  const data = db.load();
  const n = data.tables.length + 1;
  const t = {
    id: 'B' + String(n).padStart(2, '0') + '-' + Date.now().toString(36).slice(-4),
    ten: (req.body && req.body.ten) || ('Bàn ' + n),
    sucChua: Number(req.body && req.body.sucChua) || 10
  };
  data.tables.push(t);
  db.save(data);
  res.json(t);
});

app.put('/api/admin/tables/:id', requireAdmin, (req, res) => {
  const data = db.load();
  const t = data.tables.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  if (req.body && req.body.ten !== undefined) t.ten = req.body.ten;
  if (req.body && req.body.sucChua !== undefined) t.sucChua = Number(req.body.sucChua) || t.sucChua;
  db.save(data);
  res.json(t);
});

app.delete('/api/admin/tables/:id', requireAdmin, (req, res) => {
  const data = db.load();
  data.guests.forEach(g => { if (g.banId === req.params.id) g.banId = ''; });
  data.tables = data.tables.filter(x => x.id !== req.params.id);
  db.save(data);
  res.json({ ok: true });
});

/* ========================= PUBLIC API (khach dung, khong mat khau) ========================= */

app.get('/api/public/guest/:id', (req, res) => {
  const data = db.load();
  const g = data.guests.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  res.json({
    guest: guestPublicView(g),
    settings: {
      groomName: data.settings.groomName,
      brideName: data.settings.brideName,
      weddingDate: data.settings.weddingDate,
      eventTime: data.settings.eventTime,
      venue: data.settings.venue,
      couplePhoto: data.settings.couplePhoto
    }
  });
});

app.post('/api/public/guest/:id/rsvp', (req, res) => {
  const data = db.load();
  const g = data.guests.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const { attending, count } = req.body || {};
  if (attending === 'co') {
    g.trangThaiRSVP = 'co';
    const c = Number(count) || g.soNguoiMoi;
    g.soNguoiThamDuThucTe = Math.min(Math.max(c, 1), g.soNguoiMoi);
  } else if (attending === 'khong') {
    g.trangThaiRSVP = 'khong';
    g.soNguoiThamDuThucTe = 0;
  } else {
    return res.status(400).json({ error: 'invalid attending value' });
  }
  db.save(data);
  res.json(guestPublicView(g));
});

app.listen(PORT, () => {
  console.log(`Wedding guest system dang chay tai http://localhost:${PORT}`);
  console.log(`Trang quan tri: http://localhost:${PORT}/index.html`);
});
