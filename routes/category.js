const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { isAdmin, authenticateToken } = require('../middleware/auth');
const categoryController = require('../controllers/categoryController');

// Use local disk storage for category uploads
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads', 'categories');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Upload multiple files (image + video)
const uploadFiles = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]);

// Middleware to handle multer upload
const handleUpload = (req, res, next) => {
  uploadFiles(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'File upload error', details: err.message });
    }
    next();
  });
};

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategory);

// Protected admin routes with file upload
router.post('/', authenticateToken, isAdmin, handleUpload, categoryController.createCategory);
router.post('/upload', authenticateToken, isAdmin, handleUpload, categoryController.createCategory);
router.put('/:id', authenticateToken, isAdmin, handleUpload, categoryController.updateCategory);
router.put('/:id/upload', authenticateToken, isAdmin, handleUpload, categoryController.updateCategory);
router.delete('/:id', authenticateToken, isAdmin, categoryController.deleteCategory);

module.exports = router; 