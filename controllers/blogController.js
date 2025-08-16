const Blog = require('../models/Blog');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

// Get all blogs
const getAllBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find();
    res.json(blogs);
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ message: "Error fetching blogs", error: error.message });
  }
};

// Get blogs by section
const getBlogsBySection = async (req, res) => {
  try {
    const { section } = req.params;
    let query = {};
    
    switch(section) {
      case 'bestsellers':
        query = { isBestSeller: true };
        break;
      case 'featured':
        query = { isFeatured: true };
        break;
      case 'mostloved':
        query = { isMostLoved: true };
        break;
      default:
        return res.status(400).json({ message: "Invalid section" });
    }
    
    const blogs = await Blog.find(query);
    res.json(blogs);
  } catch (error) {
    console.error(`Error fetching ${section} blogs:`, error);
    res.status(500).json({ message: `Error fetching ${section} blogs`, error: error.message });
  }
};

// Get single blog
const getBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }
    res.json(blog);
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ message: "Error fetching blog", error: error.message });
  }
};

// Create new blog with file upload
const createBlogWithFiles = async (req, res) => {
  try {
    console.log('=== Starting Blog Creation ===');
    console.log('Headers:', req.headers);
    console.log('Files received:', req.files);
    console.log('Body data:', req.body);
    console.log('Auth token:', req.headers.authorization);

    if (!req.files || !req.files.mainImage) {
      console.log('Error: Missing main image');
      return res.status(400).json({ 
        error: 'Main image is required. Make sure you are uploading as multipart/form-data and the main image field is named "mainImage".' 
      });
    }

    const files = req.files;
    const blogData = req.body;
    
    // Validate required fields
    const requiredFields = [
     
    ];

    console.log('Validating required fields...');
    const missingFields = [];
    for (const field of requiredFields) {
      if (!blogData[field]) {
        missingFields.push(field);
        console.log(`Missing required field: ${field}`);
      }
    }

    if (missingFields.length > 0) {
      console.log('Error: Missing required fields:', missingFields);
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    // Process uploaded files
    console.log('Processing uploaded files...');
    const imagePaths = [];
    
    // Main image
    if (files.mainImage && files.mainImage[0]) {
      const mainImageUrl = files.mainImage[0].path; // Cloudinary URL
      imagePaths.push(mainImageUrl);
      console.log('Added main image:', mainImageUrl);
    }

    // Additional images
    for (let i = 1; i <= 3; i++) {
      if (files[`image${i}`] && files[`image${i}`][0]) {
        const imageUrl = files[`image${i}`][0].path; // Cloudinary URL
        imagePaths.push(imageUrl);
        console.log(`Added image${i}:`, imageUrl);
      }
    }

    const newBlog = new Blog({
      name: blogData.name,
      material: blogData.material,
      description: blogData.description,
      size: blogData.size,
      colour: blogData.colour,
      category: blogData.category,
      weight: blogData.weight,
      utility: blogData.utility,
      care: blogData.care,
      price: parseFloat(blogData.price),
      regularPrice: parseFloat(blogData.regularPrice),
      image: imagePaths[0], // Main image Cloudinary URL
      images: imagePaths, // All Cloudinary URLs
      inStock: blogData.inStock === 'true' || blogData.inStock === true,
      isBestSeller: blogData.isBestSeller === 'true' || blogData.isBestSeller === true,
      isFeatured: blogData.isFeatured === 'true' || blogData.isFeatured === true,
      isMostLoved: blogData.isMostLoved === 'true' || blogData.isMostLoved === true,
      codAvailable: blogData.codAvailable === 'false' ? false : true,
      stock: typeof blogData.stock !== 'undefined' ? Number(blogData.stock) : 10
    });
    
    console.log('Saving blog to database...');
    const savedBlog = await newBlog.save();
    console.log('Blog saved successfully:', savedBlog);
    
    res.status(201).json({ 
      message: "Blog created successfully", 
      blog: savedBlog,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('=== Error creating blog ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      message: "Error creating blog", 
      error: error.message,
      details: error.stack
    });
  }
};

// Update blog with file upload
const updateBlogWithFiles = async (req, res) => {
  try {
    console.log('Updating blog with files:', req.files);
    console.log('Update data:', req.body);

    const id = req.params.id;
    const files = req.files || {};
    const blogData = req.body;
    
    const existingBlog = await Blog.findById(id);
    if (!existingBlog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    // Initialize imagePaths with existing images
    let imagePaths = existingBlog.images || [];
    if (!Array.isArray(imagePaths)) {
      // If images is not an array, initialize it with the main image if it exists
      imagePaths = existingBlog.image ? [existingBlog.image] : [];
    }

    // Handle main image update
    if (files.mainImage && files.mainImage[0]) {
      const mainImageUrl = files.mainImage[0].path;
      if (imagePaths.length === 0) {
        imagePaths.push(mainImageUrl);
      } else {
        imagePaths[0] = mainImageUrl;
      }
    }

    // Handle additional images
    for (let i = 1; i <= 3; i++) {
      if (files[`image${i}`] && files[`image${i}`][0]) {
        const imageUrl = files[`image${i}`][0].path;
        if (i < imagePaths.length) {
          imagePaths[i] = imageUrl;
        } else {
          imagePaths.push(imageUrl);
        }
      }
    }

    // Ensure we have at least one image
    if (imagePaths.length === 0 && existingBlog.image) {
      imagePaths.push(existingBlog.image);
    }

    // Update blog object
    const updatedBlog = {
      name: blogData.name || existingBlog.name,
      material: blogData.material || existingBlog.material,
      description: blogData.description || existingBlog.description,
      size: blogData.size || existingBlog.size,
      colour: blogData.colour || existingBlog.colour,
      category: blogData.category || existingBlog.category,
      weight: blogData.weight || existingBlog.weight,
      utility: blogData.utility || existingBlog.utility,
      care: blogData.care || existingBlog.care,
      price: blogData.price ? parseFloat(blogData.price) : existingBlog.price,
      regularPrice: blogData.regularPrice ? parseFloat(blogData.regularPrice) : existingBlog.regularPrice,
      image: imagePaths[0],
      images: imagePaths,
      inStock: blogData.inStock !== undefined ? (blogData.inStock === 'true' || blogData.inStock === true) : existingBlog.inStock,
      isBestSeller: blogData.isBestSeller !== undefined ? (blogData.isBestSeller === 'true' || blogData.isBestSeller === true) : existingBlog.isBestSeller,
      isFeatured: blogData.isFeatured !== undefined ? (blogData.isFeatured === 'true' || blogData.isFeatured === true) : existingBlog.isFeatured,
      isMostLoved: blogData.isMostLoved !== undefined ? (blogData.isMostLoved === 'true' || blogData.isMostLoved === true) : existingBlog.isMostLoved,
      codAvailable: blogData.codAvailable === 'false' ? false : true,
      stock: typeof blogData.stock !== 'undefined' ? Number(blogData.stock) : existingBlog.stock
    };

    const result = await Blog.findByIdAndUpdate(id, updatedBlog, { new: true });
    res.json({ message: "Blog updated successfully", blog: result });
  } catch (error) {
    console.error('Error updating blog:', error);
    res.status(500).json({ message: "Error updating blog", error: error.message });
  }
};

// Update blog section flags
const updateBlogSections = async (req, res) => {
  try {
    console.log('=== Starting Section Update ===');
    console.log('Blog ID:', req.params.id);
    console.log('Update data:', req.body);

    const { id } = req.params;
    const { isBestSeller, isFeatured, isMostLoved } = req.body;

    // Validate that at least one section flag is provided
    if (isBestSeller === undefined && isFeatured === undefined && isMostLoved === undefined) {
      console.log('Error: No section flags provided');
      return res.status(400).json({ message: "At least one section flag must be provided" });
    }

    // Find the blog
    const blog = await Blog.findById(id);
    if (!blog) {
      console.log('Error: Blog not found');
      return res.status(404).json({ message: "Blog not found" });
    }

    console.log('Current blog sections:', {
      isBestSeller: blog.isBestSeller,
      isFeatured: blog.isFeatured,
      isMostLoved: blog.isMostLoved
    });

    // Build update object with only the provided flags
    const updates = {};
    if (isBestSeller !== undefined) updates.isBestSeller = isBestSeller;
    if (isFeatured !== undefined) updates.isFeatured = isFeatured;
    if (isMostLoved !== undefined) updates.isMostLoved = isMostLoved;

    console.log('Applying updates:', updates);

    // Update the blog with new section flags
    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    console.log('Updated blog sections:', {
      isBestSeller: updatedBlog.isBestSeller,
      isFeatured: updatedBlog.isFeatured,
      isMostLoved: updatedBlog.isMostLoved
    });

    res.json({
      message: "Blog sections updated successfully",
      blog: updatedBlog
    });
  } catch (error) {
    console.error('=== Error Updating Sections ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      message: "Error updating blog sections", 
      error: error.message,
      details: error.stack
    });
  }
};

// Delete blog
const deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: "Blog deleted successfully" });
  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({ message: "Error deleting blog", error: error.message });
  }
};

module.exports = {
  getAllBlogs,
  getBlogsBySection,
  getBlog,
  createBlogWithFiles,
  updateBlogWithFiles,
  updateBlogSections,
  deleteBlog
}; 