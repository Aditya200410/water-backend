const express = require('express');
const router = express.Router();
const razorpayController = require('../controllers/razorpayController');

// Create Razorpay order
router.post('/create-order', razorpayController.createOrder);

// Verify payment signature
router.post('/verify-payment', razorpayController.verifyPayment);

// Webhook handler (this will be handled by server.js with raw body parsing)
// router.post('/webhook', razorpayController.webhookHandler);

module.exports = router;
