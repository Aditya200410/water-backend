const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
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

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'products',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'avi'],
  },
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