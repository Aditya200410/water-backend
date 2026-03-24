const axios = require('axios');
const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const product = await Product.findOne();
    if (!product) { console.log("No products"); return; }
    
    // We need to bypass the security check by passing accurate values
    const dateStr = new Date().toISOString().split('T')[0];
    const adultPrice = product.adultprice || 0;
    const childPrice = product.childprice || 0;
    const advancePrice = product.advanceprice || 0;
    const adults = 1;
    const children = 0;
    const total = (adults * adultPrice) + (children * childPrice);
    const advanceAmount = adults * advancePrice;

    console.log("Testing with product", product._id, "total", total, "advance", advanceAmount);
    
    const response = await axios.post('http://localhost:5175/api/bookings/create', {
      waterpark: product._id.toString(),
      waternumber: "123",
      waterparkName: product.name,
      name: "John Doe",
      email: "john@example.com",
      phone: "1234567890",
      date: new Date().toISOString(),
      adults: adults,
      children: children,
      total: total,
      advanceAmount: advanceAmount,
      paymentType: "advance",
      paymentMethod: "razorpay",
      terms: true
    });
    console.log("Success:", response.data);
  } catch (error) {
    if (error.response) {
      console.log("Response Status:", error.response.status);
      console.log("Response Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.log("Error:", error.message);
    }
  }
  mongoose.disconnect();
}

test();
