const HeroCarousel = require('../models/heroCarousel');
const fs = require('fs');                // <-- use full fs
const fsPromises = fs.promises;          // <-- for async operations
const path = require('path');
const multer = require('multer');

// Path to JSON file where carousel items are stored
const dataFilePath = path.join(__dirname, '../data/hero-carousel.json');

// Ensure data directory exists
const dataDir = path.dirname(dataFilePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Use local disk storage for hero-carousel uploads
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads', 'hero-carousel');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// Helper function to read carousel data
const readCarouselData = async () => {
  try {
    const data = await fsPromises.readFile(dataFilePath, 'utf8');
    return JSON.parse(data).carousel || [];
  } catch (error) {
    // File may not exist on first run, or JSON might be empty
    console.error('Error reading carousel data:', error.message);
    return [];
  }
};

// Helper function to write carousel data
const writeCarouselData = async (data) => {
  try {
    await fsPromises.writeFile(
      dataFilePath,
      JSON.stringify({ carousel: data }, null, 2),
      'utf8'
    );
    return true;
  } catch (error) {
    console.error('Error writing carousel data:', error.message);
    return false;
  }
};

// Get all carousel items
const getAllCarouselItems = async (req, res) => {
  try {
    const items = await HeroCarousel.find().sort('order');
    res.json(items);
  } catch (error) {
    console.error('Error fetching carousel items:', error);
    res.status(500).json({ message: "Error fetching carousel items", error: error.message });
  }
};

// Get single carousel item
const getCarouselItem = async (req, res) => {
  try {
    const item = await HeroCarousel.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Carousel item not found" });
    }
    res.json(item);
  } catch (error) {
    console.error('Error fetching carousel item:', error);
    res.status(500).json({ message: "Error fetching carousel item", error: error.message });
  }
};

// Get active carousel items
const getActiveCarouselItems = async (req, res) => {
  try {
    const items = await HeroCarousel.find({ isActive: true }).sort('order');
    res.json(items);
  } catch (error) {
    console.error('Error fetching active carousel items:', error);
    res.status(500).json({ message: "Error fetching active carousel items", error: error.message });
  }
};

// Create carousel item with file upload
const createCarouselItemWithFiles = async (req, res) => {
  try {
    console.log('=== Starting Hero Carousel Item Creation ===');
    console.log('Headers:', req.headers);
    console.log('Files received:', req.files);
    console.log('Body data:', req.body);

    // Require image
    if (!req.files || !req.files.image) {
      return res.status(400).json({ 
        error: 'Image is required. Make sure you are uploading as multipart/form-data and the file field is named "image".' 
      });
    }

    const files = req.files;
    const itemData = req.body;

    // Validate required fields
    const requiredFields = ["title"];
    const missingFields = [];
    for (const field of requiredFields) {
      if (!itemData[field]) {
        missingFields.push(field);
      }
    }
    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    // Process uploaded file
    let imageUrl = files.image[0].path;

    // If multer stored a filesystem path, convert to public URL
    if (typeof imageUrl === 'string' && (imageUrl.includes('\\') || imageUrl.match(/^[A-Za-z]:\\/))) {
      const filename = path.basename(imageUrl);
      imageUrl = `/waterbackend/data/uploads/hero-carousel/${filename}`;
    }

    // Get current max order
    const maxOrderItem = await HeroCarousel.findOne().sort('-order');
    const newOrder = maxOrderItem ? maxOrderItem.order + 1 : 0;

    const newItem = new HeroCarousel({
      title: itemData.title.trim(),
      subtitle: (itemData.subtitle || '').trim(),
      description: (itemData.description || '').trim(),
      buttonText: (itemData.buttonText || 'Shop Now').trim(),
      buttonLink: (itemData.buttonLink || '/shop').trim(),
      image: imageUrl,
      isMobile: itemData.isMobile === 'true' || itemData.isMobile === true,
      isActive: itemData.isActive === 'true' || itemData.isActive === true,
      order: newOrder
    });

    console.log('Saving carousel item to database...');
    const savedItem = await newItem.save();
    console.log('Carousel item saved successfully:', savedItem);
    
    res.status(201).json({ 
      message: "Carousel item created successfully", 
      item: savedItem,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('=== Error creating carousel item ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      message: "Error creating carousel item", 
      error: error.message,
      details: error.stack
    });
  }
};

// Update carousel item with file upload
const updateCarouselItemWithFiles = async (req, res) => {
  try {
    console.log('Updating carousel item with files:', req.files);
    console.log('Update data:', req.body);

    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: "Carousel item ID is required" });
    }

    const files = req.files || {};
    const itemData = req.body;
    
    const existingItem = await HeroCarousel.findById(id);
    if (!existingItem) {
      return res.status(404).json({ message: "Carousel item not found" });
    }

    // Update logic
    let imageUrl = existingItem.image;
    if (files.image && files.image[0]) {
      imageUrl = files.image[0].path;
      if (typeof imageUrl === 'string' && (imageUrl.includes('\\') || imageUrl.match(/^[A-Za-z]:\\/))) {
        const filename = path.basename(imageUrl);
        imageUrl = `/waterbackend/data/uploads/hero-carousel/${filename}`;
      }
    }

    const updatedItem = {
      title: (itemData.title || existingItem.title).trim(),
      subtitle: (itemData.subtitle || existingItem.subtitle || '').trim(),
      description: (itemData.description || existingItem.description || '').trim(),
      buttonText: (itemData.buttonText || existingItem.buttonText || 'Shop Now').trim(),
      buttonLink: (itemData.buttonLink || existingItem.buttonLink || '/shop').trim(),
      image: imageUrl,
      isMobile: typeof itemData.isMobile !== 'undefined'
        ? (itemData.isMobile === 'true' || itemData.isMobile === true)
        : existingItem.isMobile,
      isActive: typeof itemData.isActive !== 'undefined'
        ? (itemData.isActive === 'true' || itemData.isActive === true)
        : existingItem.isActive,
      order: typeof itemData.order !== 'undefined'
        ? itemData.order
        : existingItem.order
    };

    // Log the update operation
    console.log('Updating carousel item with data:', {
      id,
      imageUrl: imageUrl,
      filesReceived: Object.keys(files)
    });

    const savedItem = await HeroCarousel.findByIdAndUpdate(id, updatedItem, { new: true });

    res.json({ 
      message: "Carousel item updated successfully", 
      item: savedItem,
      uploadedFiles: files
    });
  } catch (error) {
    console.error('Error updating carousel item:', error);
    res.status(500).json({ message: "Error updating carousel item", error: error.message });
  }
};

// Delete carousel item
const deleteCarouselItem = async (req, res) => {
  try {
    const item = await HeroCarousel.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Carousel item not found" });
    }

    // Reorder remaining items
    const remainingItems = await HeroCarousel.find().sort('order');
    for (let i = 0; i < remainingItems.length; i++) {
      await HeroCarousel.findByIdAndUpdate(remainingItems[i]._id, { order: i });
    }

    res.json({ message: "Carousel item deleted successfully" });
  } catch (error) {
    console.error('Error deleting carousel item:', error);
    res.status(500).json({ message: "Error deleting carousel item", error: error.message });
  }
};

// Toggle active status
const toggleCarouselActive = async (req, res) => {
  try {
    const item = await HeroCarousel.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Carousel item not found" });
    }

    item.isActive = !item.isActive;
    await item.save();
    res.json(item);
  } catch (error) {
    console.error('Error toggling carousel item status:', error);
    res.status(500).json({ message: "Error toggling carousel item status", error: error.message });
  }
};

// Update carousel items order
const updateCarouselOrder = async (req, res) => {
  try {
    const items = req.body;
    for (let i = 0; i < items.length; i++) {
      await HeroCarousel.findByIdAndUpdate(items[i]._id, { order: i });
    }
    res.json({ message: "Order updated successfully" });
  } catch (error) {
    console.error('Error updating carousel order:', error);
    res.status(500).json({ message: "Error updating carousel order", error: error.message });
  }
};

module.exports = {
  upload,
  getAllCarouselItems,
  getCarouselItem,
  getActiveCarouselItems,
  createCarouselItemWithFiles,
  updateCarouselItemWithFiles,
  deleteCarouselItem,
  toggleCarouselActive,
  updateCarouselOrder
};
