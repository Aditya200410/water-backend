const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Use local disk storage for hero-carousel (or generic uploads)
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads', 'hero-carousel');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = upload;