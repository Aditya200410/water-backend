const express = require('express');
const path = require('path');
const shortid = require('shortid');
const Razorpay = require('razorpay');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// CORS configuration
app.use(cors());
app.use(bodyParser.json());

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_uGoq5ABJztRAhk',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'FySe2f5fie9hij1a5s6clk9B'
});

// Serve logo
app.get('/logo.svg', (req, res) => {
  res.sendFile(path.join(__dirname, 'logo.svg'));
});

// Webhook verification endpoint
app.post('/verification', (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '12345678';
  
  console.log('Webhook verification request:', req.body);
  console.log('Headers:', req.headers);

  const crypto = require('crypto');
  const shasum = crypto.createHmac('sha256', secret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest('hex');

  console.log('Generated signature:', digest);
  console.log('Received signature:', req.headers['x-razorpay-signature']);

  if (digest === req.headers['x-razorpay-signature']) {
    console.log('Webhook signature verified successfully');
    // Save webhook data for debugging
    require('fs').writeFileSync('payment-webhook.json', JSON.stringify(req.body, null, 4));
  } else {
    console.log('Webhook signature verification failed');
  }
  
  res.json({ status: 'ok' });
});

// Create Razorpay order
app.post('/razorpay', async (req, res) => {
  try {
    const payment_capture = 1;
    const amount = req.body.amount || 499; // Default amount
    const currency = req.body.currency || 'INR';

    const options = {
      amount: amount * 100, // Convert to paise
      currency,
      receipt: shortid.generate(),
      payment_capture
    };

    console.log('Creating Razorpay order with options:', options);
    
    const response = await razorpay.orders.create(options);
    console.log('Razorpay order created:', response);
    
    res.json({
      id: response.id,
      currency: response.currency,
      amount: response.amount
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'Razorpay test server is running',
    timestamp: new Date().toISOString(),
    razorpay_key: process.env.RAZORPAY_KEY_ID || 'rzp_test_uGoq5ABJztRAhk'
  });
});

const PORT = process.env.PORT || 1337;
app.listen(PORT, () => {
  console.log(`Razorpay test server listening on port ${PORT}`);
  console.log(`Test endpoint: http://localhost:${PORT}/test`);
  console.log(`Create order: POST http://localhost:${PORT}/razorpay`);
  console.log(`Webhook: POST http://localhost:${PORT}/verification`);
});
