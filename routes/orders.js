// File: admin/backend/routes/orders.js (Now using Booking model)
const express = require("express");
const Booking = require("../models/Booking");
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { createOrder, getOrdersByEmail, getOrderById } = require('../controllers/orderController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const bookingsFilePath = path.join(__dirname, '../data/bookings.json');

// Helper function to read bookings from JSON file
const readBookings = () => {
  try {
    if (fs.existsSync(bookingsFilePath)) {
      const data = fs.readFileSync(bookingsFilePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error reading bookings file:', error);
    return [];
  }
};

// Helper function to write bookings to JSON file
const writeBookings = (bookings) => {
  try {
    const dirPath = path.dirname(bookingsFilePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(bookingsFilePath, JSON.stringify(bookings, null, 2));
  } catch (error) {
    console.error('Error writing bookings file:', error);
    throw new Error('Failed to save booking to JSON file');
  }
};

// Admin: Get all bookings from MongoDB (not bookings.json) - PROTECTED
router.get('/json', authenticateToken, isAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ bookingDate: -1 });
    res.json({ success: true, bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch bookings from MongoDB', error: error.message });
  }
});

// Create booking (legacy route for backwards compatibility)
router.post("/", createOrder);

// Route to get all bookings for a user by email
// GET /api/orders?email=user@example.com
router.get('/', getOrdersByEmail);

// Route to get booking status by ID
// GET /api/orders/status/:id (MUST come before /:id to avoid route conflict)
router.get('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find booking by custom booking ID
    let booking = await Booking.findOne({ customBookingId: id });
    if (booking) {
      return res.status(200).json({ success: true, booking });
    }
    
    // Not found
    return res.status(404).json({ success: false, message: 'Booking not found' });
  } catch (error) {
    console.error('[Orders Status] Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Route to get a single booking by its ID
// GET /api/orders/:id
router.get('/:id', getOrderById);

module.exports = router;
