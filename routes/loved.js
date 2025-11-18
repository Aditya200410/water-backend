const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require('fs');
const path = require('path');
const { isAdmin, authenticateToken } = require('../middleware/auth');
const { 
  getAllLovedProducts, 
  getLovedProduct, 
  createLovedProductWithFiles, 
  updateLovedProductWithFiles, 
  deleteLovedProduct 
} = require('../controllers/lovedController');

// Use local disk storage for loved uploads
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads', 'loved');
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
router.get("/", getAllLovedProducts);
router.get("/:id", getLovedProduct);

// Admin routes (Protected)
router.post("/", authenticateToken, isAdmin, uploadImages, createLovedProductWithFiles);
router.put("/:id", authenticateToken, isAdmin, uploadImages, updateLovedProductWithFiles);
router.delete("/:id", authenticateToken, isAdmin, deleteLovedProduct);

module.exports = router;
