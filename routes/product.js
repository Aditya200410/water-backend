const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require('fs');
const path = require('path');
const { isAdmin, authenticateToken } = require('../middleware/auth');
const { 
  getAllProducts, 
  getProduct, 
  createProductWithFiles, 
  updateProductWithFiles, 
  deleteProduct,
  getProductsBySection,
  updateProductSections
} = require('../controllers/productController');

// Use local disk storage for product images (admin uploads saved on server)
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads', 'products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const safeName = `${Date.now()}-${file.fieldname}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({ storage: storage });

// ✅ THIS IS THE CORRECT CONFIGURATION
const uploadHandler = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'images', maxCount: 9 },      // Expects an array named 'images'
  { name: 'videos', maxCount: 5 }
]);

// --- ROUTES ---

// Public routes
router.get("/", getAllProducts);
router.get("/section/:section", getProductsBySection);
router.get("/:id", getProduct);

// Admin routes (Protected)
router.post("/", authenticateToken, isAdmin, uploadHandler, createProductWithFiles);
router.put("/:id", authenticateToken, isAdmin, uploadHandler, updateProductWithFiles);
router.patch("/:id/sections", authenticateToken, isAdmin, updateProductSections);
router.delete("/:id", authenticateToken, isAdmin, deleteProduct);

module.exports = router;