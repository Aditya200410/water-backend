// File: admin/backend/server.js
require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");

// Import routes
const shopRoutes = require("./routes/shop");
const orderRoutes = require("./routes/orders");
const blogRoutes = require("./routes/blogs");
const authRoutes = require('./routes/auth');
const adminAuthRoutes = require('./routes/adminAuth');
const lovedRoutes = require('./routes/loved');
const categoryRoutes = require('./routes/category');
const featuredProductRoutes = require('./routes/featuredProduct');
const bestSellerRoutes = require('./routes/bestSeller');
const cartRoutes = require('./routes/cart');
const heroCarouselRoutes = require('./routes/heroCarousel');
const couponRoutes = require('./routes/coupon');
const bookingRoutes = require('./routes/bookingRoutes');

const app = express();

// ---------------------------
// 1️⃣ CORS Setup
// ---------------------------
const allowedOrigins = [
  'http://localhost:5173',
  'https://admin.waterparkchalo.com',
  'https://waterpark-frontend.vercel.app',
  'https://water-admin-lyart.vercel.app',
  'https://www.waterparkchalo.com',
  'https://waterparkchalo.com'
];

app.use(cors({
  origin: function(origin, callback){
    if (!origin) return callback(null, true); // allow server-to-server requests like curl or Postman
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ---------------------------
// 2️⃣ Razorpay Webhook
// ---------------------------
// Must come BEFORE express.json() to get raw body
app.post('/api/bookings/webhook/razorpay', 
  express.raw({ type: 'application/json' }), 
  require('./controllers/bookingController').razorpayWebhook
);

// ---------------------------
// 3️⃣ Middleware
// ---------------------------
app.use(express.json());
app.use(cookieParser());

// ---------------------------
// 4️⃣ Ensure data directories exist
// ---------------------------
const dataDir = path.join(__dirname, 'data');
const userProductDir = path.join(dataDir, 'userproduct');

[dataDir, userProductDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created directory:', dir);
  }
});

// ---------------------------
// 5️⃣ Serve static files
// ---------------------------
app.use('/pawnbackend/data', express.static(path.join(__dirname, 'data'), {
  fallthrough: true,
  maxAge: '1h'
}));

// ---------------------------
// 6️⃣ MongoDB Connection
// ---------------------------
const MONGODB_URI = process.env.MONGODB_URI || 
  "mongodb+srv://lightyagami98k:UN1cr0DnJwISvvgs@cluster0.uwkswmj.mongodb.net/waterpark?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB connection error:", err));

// ---------------------------
// 7️⃣ API Routes
// ---------------------------
app.use("/api/shop", shopRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/bestseller', bestSellerRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/loved', lovedRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/featured-products', featuredProductRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/hero-carousel', heroCarouselRoutes);
app.use('/api/coupons', couponRoutes);
app.use("/api/blog", blogRoutes);
app.use('/api/data-page', require('./routes/dataPage'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/withdrawal', require('./routes/withdrawal'));
app.use('/api/commission', require('./routes/commission'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/msg91', require('./routes/msg91'));
app.use('/api/bookings', bookingRoutes);
app.use('/api/tickets', require('./routes/tickets'));

// ---------------------------
// 8️⃣ Health Check & CORS Test
// ---------------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/test-cors', (req, res) => {
  res.status(200).json({
    message: 'CORS is working correctly',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// ---------------------------
// 9️⃣ Error handling
// ---------------------------
app.use((err, req, res, next) => {
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// ---------------------------
// 10️⃣ Start Server
// ---------------------------
const PORT = process.env.PORT || 5175;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
