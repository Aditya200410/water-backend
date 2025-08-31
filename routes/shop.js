const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
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

// --- 👇 MODIFIED SECTION: Dynamic storage for images AND videos ---

// Create a storage engine that handles different file types dynamically
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // This function runs for each file and sets parameters based on its field name
    
    // If the file is a video
    if (file.fieldname === 'videos') {
      return {
     
        resource_type: 'video', // This is crucial for Cloudinary
        allowed_formats: ['mp4', 'mov', 'webm', 'avi'],
      };
    } 
    // Otherwise, treat it as an image
    else {
      return {
       
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 800, height: 800, crop: 'limit' }],
      };
    }
  },
});

const upload = multer({ storage: storage });

// Update upload middleware to accept both images AND videos
const handleFileUploads = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'videos', maxCount: 5 } // Add this line to accept video files
]);

// --- 👆 END OF MODIFIED SECTION ---

// Get all products
router.get("/", getAllProducts);

// Get products by section
router.get("/section/:section", getProductsBySection);

// Get single product
router.get("/:id", getProduct);

// Create product with file uploads (changed from /upload to /)
router.post("/upload", handleFileUploads, createProductWithFiles);

// Update product by id with file uploads
router.put("/:id", handleFileUploads, updateProductWithFiles);

// Update product sections
router.patch("/:id/sections", updateProductSections);

// Delete product by id
router.delete("/:id", deleteProduct);

module.exports = router;