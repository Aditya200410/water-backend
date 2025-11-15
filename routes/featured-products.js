const express = require("express");
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { isAdmin, authenticateToken } = require('../middleware/auth');
const {
  getAllFeaturedProducts,
  getFeaturedProduct,
  createFeaturedProductWithFiles,
  updateFeaturedProductWithFiles,
  deleteFeaturedProduct
} = require('../controllers/featuredProductController');

// Use local disk storage for featured-products uploads
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads', 'featured-products');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Configure multiple file upload fields
const uploadFields = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 }
]);

// Middleware to handle multer upload
const handleUpload = (req, res, next) => {
  uploadFields(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'File upload error', details: err.message });
    }
    next();
  });
};

// Public routes
router.get("/", getAllFeaturedProducts);
router.get("/:id", getFeaturedProduct);

// Admin routes
router.post("/", authenticateToken, isAdmin, handleUpload, createFeaturedProductWithFiles);
router.put("/:id", authenticateToken, isAdmin, handleUpload, updateFeaturedProductWithFiles);
router.delete("/:id", authenticateToken, isAdmin, deleteFeaturedProduct);

module.exports = router; 