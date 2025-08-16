const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { 
  getAllBlogs, 
  getBlog, 
  createBlogWithFiles, 
  updateBlogWithFiles, 
  deleteBlog,
  getBlogsBySection,
  updateBlogSections
} = require('../controllers/blogController');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pawnshop-blogs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
  },
});

const upload = multer({ storage: storage });

// Upload multiple images (main image + 3 additional images)
const uploadImages = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 }
]);

// Middleware to handle multer upload
const handleUpload = (req, res, next) => {
  uploadImages(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error', details: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'File upload error', details: err.message });
    }
    next();
  });
};

// Get all blogs
router.get("/", getAllBlogs);

// Get blogs by section
router.get("/section/:section", getBlogsBySection);

// Get single blog
router.get("/:id", getBlog);

// Upload images and create blog
router.post("/upload", handleUpload, createBlogWithFiles);

// Update blog by id
router.put("/:id", handleUpload, updateBlogWithFiles);

// Update blog sections
router.patch("/:id/sections", updateBlogSections);

// Delete blog by id
router.delete("/:id", deleteBlog);

module.exports = router;
 