const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  sd:{type:String, required:true,trim:true},
  category: { type: String, required: true, trim: true },
  utility: { type: String, required: true, trim: true },
  care: { type: String, required: true, trim: true },
  
  price: { type: Number, required: true },  // weekend child price

  advanceprice: { type: Number, required: true }, // advance booking price
  terms: { type: String, required: true, trim: true },
  
  regularprice: { type: Number, required: true }, //regularprice
  adultprice: { type: Number, required: true }, //adult price
  childprice: { type: Number, required: true },  //child price
  weekendprice: { type: Number, required: false }, //weekend adult price
  image: { type: String, required: true },          //weekend adult price
  images: [{ type: String }],
  inStock: { type: Boolean, default: true },
  stock: { type: Number, default: 10 },
  isBestSeller: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  isMostLoved: { type: Boolean, default: false },
  rating: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 },
  codAvailable: { type: Boolean, default: true },
  date: { type: Date, default: Date.now }
});


// Create and export the Product model
const Product = mongoose.model('Product', productSchema);
module.exports = Product;
