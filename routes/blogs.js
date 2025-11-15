const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require('fs');
const path = require('path');
const { 
  getAllBlogs, 
  getBlog, 
  createBlogWithFiles, 
  updateBlogWithFiles, 
  deleteBlog,
  getBlogsBySection,
  updateBlogSections
} = require('../controllers/blogController');

// Use local disk storage for blog uploads
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads', 'blogs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

const upload = multer({ storage });

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
router.post("/", handleUpload, createBlogWithFiles);

// Update blog by id
router.put("/:id", handleUpload, updateBlogWithFiles);

// Update blog sections
router.patch("/:id/sections", updateBlogSections);

// Delete blog by id
router.delete("/:id", deleteBlog);

module.exports = router;
 