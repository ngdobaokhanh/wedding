// Luu du lieu that vao mot file JSON tren o dia cua server (data/db.json).
// Voi quy mo mot dam cuoi (vai tram khach), file JSON la du nhanh va don gian,
// khong can cai them database rieng, khong loi cai dat native module.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function defaultData() {
  return {
    settings: {
      groomName: 'Minh An',
      brideName: 'Thảo Chi',
      weddingDate: '2027-02-14',
      eventTime: '11:00',
      venue: 'Trung tâm tiệc cưới Hoa Sen, 25 Láng Hạ, Hà Nội',
      rsvpDeadline: '2027-01-20',
      couplePhoto: ''
    },
    guests: [],
    tables: [
      { id: 'B01', ten: 'Bàn 1', sucChua: 10 },
      { id: 'B02', ten: 'Bàn 2', sucChua: 10 }
    ],
    nextGuestSeq: 1
  };
}

function ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData(), null, 2));
  }
}

function load() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // dam bao du cac truong ngay ca khi file cu thieu field moi
    return Object.assign(defaultData(), parsed, {
      settings: Object.assign(defaultData().settings, parsed.settings || {})
    });
  } catch (e) {
    console.error('Lỗi đọc data/db.json, dùng dữ liệu mặc định:', e.message);
    return defaultData();
  }
}

function save(data) {
  ensureFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { load, save, defaultData };
