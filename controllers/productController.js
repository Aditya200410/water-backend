const Product = require('../models/Product');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

// Get all products
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: "Error fetching products", error: error.message });
  }
};

// Get products by section
const getProductsBySection = async (req, res) => {
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
    
    const products = await Product.find(query);
    res.json(products);
  } catch (error) {
    console.error(`Error fetching ${section} products:`, error);
    res.status(500).json({ message: `Error fetching ${section} products`, error: error.message });
  }
};

// Get single product
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: "Error fetching product", error: error.message });
  }
};

// Create new product with file upload
const createProductWithFiles = async (req, res) => {
  try {
    console.log('=== Starting Product Creation ===');
    console.log('Files received:', req.files);
    console.log('Body data:', req.body);

    if (!req.files || !req.files.mainImage) {
      return res.status(400).json({ 
        error: 'Main image is required. Ensure the field is named "mainImage".' 
      });
    }

    const files = req.files;
    const productData = req.body;
    
    const requiredFields = ["name", "sd", "faq", "description", "category", "utility", "care", "price", "advanceprice", "terms", "regularprice", "adultprice", "childprice", "weekendprice"];
    const missingFields = requiredFields.filter(field => !productData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    console.log('Processing uploaded files...');
    const imagePaths = [];
    
    // 1. Add Main image (sent as 'mainImage')
    if (files.mainImage && files.mainImage[0]) {
      const mainImageUrl = files.mainImage[0].path; // Cloudinary URL
      imagePaths.push(mainImageUrl);
      console.log('Added main image:', mainImageUrl);
    }

    // 2. Add Additional images (sent as an array named 'images')
    if (files.images && files.images.length > 0) {
      files.images.forEach(file => {
        imagePaths.push(file.path);
        console.log('Added additional image:', file.path);
      });
    }

    // 3. Process uploaded videos
    const videoPaths = files.videos ? files.videos.map(video => video.path) : [];
    console.log('Added videos:', videoPaths);

    const newProduct = new Product({
      name: productData.name,
      material: productData.material,
      description: productData.description,
      size: productData.size,
      colour: productData.colour,
      sd: productData.sd,
      faq: productData.faq,
      category: productData.category,
      weight: productData.weight,
      weekendadvance: productData.weekendadvance,
      utility: productData.utility,
      care: productData.care,
      advanceprice: parseFloat(productData.advanceprice),
      terms: productData.terms,
      price: parseFloat(productData.price),
      regularprice: parseFloat(productData.regularprice),
      adultprice: parseFloat(productData.adultprice),
      childprice: parseFloat(productData.childprice),
      weekendprice: productData.weekendprice ? parseFloat(productData.weekendprice) : undefined,
      maplink: productData.maplink,
      waternumber: productData.waternumber,
      image: imagePaths[0], // Main image is the first in the array
      images: imagePaths,  // Full array of all image URLs
      videos: videoPaths,
      inStock: productData.inStock === 'true' || productData.inStock === true,
      isBestSeller: productData.isBestSeller === 'true' || productData.isBestSeller === true,
      isFeatured: productData.isFeatured === 'true' || productData.isFeatured === true,
      isMostLoved: productData.isMostLoved === 'true' || productData.isMostLoved === true,
      codAvailable: productData.codAvailable === 'false' ? false : true,
      stock: typeof productData.stock !== 'undefined' ? Number(productData.stock) : 10,
    });
    
    console.log('Saving product to database...');
    const savedProduct = await newProduct.save();
    console.log('Product saved successfully.');
    
    res.status(201).json({ 
      message: "Product created successfully", 
      product: savedProduct,
    });
  } catch (error) {
    console.error('=== Error creating product ===', error);
    res.status(500).json({ 
      message: "Error creating product", 
      error: error.message,
    });
  }
};

// Update product with file upload
const updateProductWithFiles = async (req, res) => {
  try {
    console.log('=== Starting Product Update ===');
    console.log('Files received:', req.files);
    console.log('Body data:', req.body);

    const id = req.params.id;
    const files = req.files || {};
    const productData = req.body;
    
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 1. Get the list of existing images to keep from the frontend
    // The frontend sends this as a JSON string array.
    const retainedUrls = JSON.parse(productData.retainedUrls || '[]');
    console.log('Retained image URLs:', retainedUrls);

    // 2. Get URLs of newly uploaded files
    const newImageUrls = [];
    if (files.mainImage && files.mainImage[0]) {
      newImageUrls.push(files.mainImage[0].path);
      console.log('Added new main image:', files.mainImage[0].path);
    }
    if (files.images && files.images.length > 0) {
      files.images.forEach(file => {
        newImageUrls.push(file.path);
        console.log('Added new additional image:', file.path);
      });
    }

    // 3. Combine retained and new URLs to form the final image array
    const finalImagePaths = [...retainedUrls, ...newImageUrls];
    console.log('Final image array for update:', finalImagePaths);
    
    // 4. Handle video updates (additive approach)
    let videoPaths = existingProduct.videos || [];
    if (files.videos && files.videos.length > 0) {
        const newVideoUrls = files.videos.map(video => video.path);
        videoPaths = videoPaths.concat(newVideoUrls);
        console.log('Updated video paths:', videoPaths);
    }

    const updatedProduct = {
      name: productData.name || existingProduct.name,
      material: productData.material || existingProduct.material,
      description: productData.description || existingProduct.description,
      sd: productData.sd || existingProduct.sd,
      faq: productData.faq || existingProduct.faq,
      size: productData.size || existingProduct.size,
      colour: productData.colour || existingProduct.colour,
      category: productData.category || existingProduct.category,
      weight: productData.weight || existingProduct.weight,
      utility: productData.utility || existingProduct.utility,
      care: productData.care || existingProduct.care,
      advanceprice: productData.advanceprice ? parseFloat(productData.advanceprice) : existingProduct.advanceprice,
      terms: productData.terms || existingProduct.terms,
      price: productData.price ? parseFloat(productData.price) : existingProduct.price,
      regularprice: productData.regularprice ? parseFloat(productData.regularprice) : existingProduct.regularprice,
      weekendadvance: productData.weekendadvance ? parseFloat(productData.weekendadvance) : existingProduct.weekendadvance,
      adultprice: productData.adultprice ? parseFloat(productData.adultprice) : existingProduct.adultprice,
      childprice: productData.childprice ? parseFloat(productData.childprice) : existingProduct.childprice,
      weekendprice: productData.weekendprice ? parseFloat(productData.weekendprice) : existingProduct.weekendprice,
      maplink: productData.maplink || existingProduct.maplink,
      waternumber: productData.waternumber || existingProduct.waternumber,
      image: finalImagePaths[0] || null, // The first image is the main image
      images: finalImagePaths,
      videos: videoPaths,
      inStock: productData.inStock !== undefined ? (productData.inStock === 'true' || productData.inStock === true) : existingProduct.inStock,
      isBestSeller: productData.isBestSeller !== undefined ? (productData.isBestSeller === 'true' || productData.isBestSeller === true) : existingProduct.isBestSeller,
      isFeatured: productData.isFeatured !== undefined ? (productData.isFeatured === 'true' || productData.isFeatured === true) : existingProduct.isFeatured,
      isMostLoved: productData.isMostLoved !== undefined ? (productData.isMostLoved === 'true' || productData.isMostLoved === true) : existingProduct.isMostLoved,
      codAvailable: productData.codAvailable === 'false' ? false : true,
      stock: typeof productData.stock !== 'undefined' ? Number(productData.stock) : existingProduct.stock
    };

    const result = await Product.findByIdAndUpdate(id, updatedProduct, { new: true });
    res.json({ message: "Product updated successfully", product: result });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: "Error updating product", error: error.message });
  }
};

// Update product section flags
const updateProductSections = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBestSeller, isFeatured, isMostLoved } = req.body;

    if (isBestSeller === undefined && isFeatured === undefined && isMostLoved === undefined) {
      return res.status(400).json({ message: "At least one section flag must be provided" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const updates = {};
    if (isBestSeller !== undefined) updates.isBestSeller = isBestSeller;
    if (isFeatured !== undefined) updates.isFeatured = isFeatured;
    if (isMostLoved !== undefined) updates.isMostLoved = isMostLoved;

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json({
      message: "Product sections updated successfully",
      product: updatedProduct
    });
  } catch (error) {
    console.error('Error Updating Sections:', error);
    res.status(500).json({ 
      message: "Error updating product sections", 
      error: error.message,
    });
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: "Error deleting product", error: error.message });
  }
};

module.exports = {
  getAllProducts,
  getProductsBySection,
  getProduct,
  createProductWithFiles,
  updateProductWithFiles,
  updateProductSections,
  deleteProduct
};