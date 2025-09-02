const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: false,
    trim: true
  },
 
 
  category: {
    type: String,
    required: false,
    trim: true
  },

  utility: {
    type: String,
    required: false,
    trim: true
  },
  care: {
    type: String,
    required: false,
    trim: true
  },
 
  image: {
    type: String,
    required: true
  },
  images: [{
    type: String
  }],
 
  isBestSeller: {
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isMostLoved: {
    type: Boolean,
    default: false
  },
  isPatner: {
    type: Boolean,
    default: false
  },
  rating: {
    type: Number,
    default: 0
  },
  reviews: {
    type: Number,
    default: 0
  },
  codAvailable: {
    type: Boolean,
    default: true
  },
  date: {
    type: Date,
    default: Date.now
  }
});

const Blog = mongoose.model('Blog', blogSchema);
module.exports = Blog; 