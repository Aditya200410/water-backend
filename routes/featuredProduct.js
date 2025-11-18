const express = require("express");
const router = express.Router();
const multer = require("multer");
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

// Use local disk storage for featured-product uploads
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads', 'featured-products');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

const upload = multer({ 
  storage, 
  limits: { 
    fileSize: 500 * 1024 * 1024,
    fieldNameSize: 100,
    fieldSize: 500 * 1024 * 1024
  } 
});

// Upload multiple images (main image + 3 additional images)
const uploadImages = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 }
]);

// Public routes
router.get("/", getAllFeaturedProducts);
router.get("/:id", getFeaturedProduct);

// Admin routes (Protected)
router.post("/", authenticateToken, isAdmin, uploadImages, createFeaturedProductWithFiles);
router.put("/:id", authenticateToken, isAdmin, uploadImages, updateFeaturedProductWithFiles);
router.delete("/:id", authenticateToken, isAdmin, deleteFeaturedProduct);

module.exports = router; 