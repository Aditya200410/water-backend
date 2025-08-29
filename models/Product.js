const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  sd: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  utility: { type: String, required: true, trim: true },
  care: { type: String, required: true, trim: true },
  
  // New fields added here
  maplink: { type: String, required: false, trim: true }, // For Google Maps link
  waterparknumber: { type: String, required: false, trim: true }, // For contact number

  price: { type: Number, required: true },       // weekend child price
  weekendprice: { type: Number, required: false }, // weekend adult price
  weekendadvance: { type: Number, required: false }, // weekend advance
  advanceprice: { type: Number, required: true }, // advance booking price for all day
  terms: { type: String, required: true, trim: true },
  
  regularprice: { type: Number, required: true }, // regular price
  adultprice: { type: Number, required: true },   // adult price
  childprice: { type: Number, required: true },   // child price

  image: { type: String, required: true },
  images: [{ type: String }],
  inStock: { type: Boolean, default: true },
  stock: { type: Number, default: 10 },
  isBestSeller: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  isMostLoved: { type: Boolean, default: false },
  rating: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 },
  codAvailable: { type: Boolean, default: true },
  date: { type: Date, default: Date.now },
  videos: [{ type: String }],
});

// Create and export the Product model
const Product = mongoose.model('Product', productSchema);
module.exports = Product;