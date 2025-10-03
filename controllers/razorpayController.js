const Razorpay = require('razorpay');
const crypto = require('crypto');
const shortid = require('shortid');
const Booking = require('../models/Booking');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create Razorpay order
exports.createOrder = async (req, res) => {
  try {
    console.log('🛒 [RAZORPAY ORDER] ==========================================');
    console.log('🛒 [RAZORPAY ORDER] Creating new Razorpay order');
    console.log('🛒 [RAZORPAY ORDER] ==========================================');
    
    const { amount, currency = 'INR', receipt } = req.body;
    
    console.log('🛒 [RAZORPAY ORDER] Order request:', {
      amount,
      currency,
      receipt,
      timestamp: new Date().toISOString()
    });
    
    if (!amount) {
      console.error('❌ [RAZORPAY ORDER] Amount is required');
      return res.status(400).json({ 
        success: false, 
        message: 'Amount is required' 
      });
    }

    const orderOptions = {
      amount: amount * 100, // Convert to paise
      currency,
      receipt: receipt || shortid.generate(),
      payment_capture: 1
    };

    console.log('🛒 [RAZORPAY ORDER] Order options:', orderOptions);
    
    const order = await razorpay.orders.create(orderOptions);
    
    console.log('✅ [RAZORPAY ORDER] ==========================================');
    console.log('✅ [RAZORPAY ORDER] ORDER CREATED SUCCESSFULLY!');
    console.log('✅ [RAZORPAY ORDER] ==========================================');
    console.log('✅ [RAZORPAY ORDER] Order ID:', order.id);
    console.log('✅ [RAZORPAY ORDER] Amount:', order.amount);
    console.log('✅ [RAZORPAY ORDER] Currency:', order.currency);
    console.log('✅ [RAZORPAY ORDER] Receipt:', order.receipt);
    console.log('✅ [RAZORPAY ORDER] Status:', order.status);
    console.log('✅ [RAZORPAY ORDER] Timestamp:', new Date().toISOString());
    console.log('✅ [RAZORPAY ORDER] ==========================================');
    
    res.json({
      success: true,
      id: order.id,
      currency: order.currency,
      amount: order.amount
    });
    
  } catch (error) {
    console.error('❌ [RAZORPAY ORDER] Error creating order:', error);
    console.error('❌ [RAZORPAY ORDER] Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
};

// Razorpay webhook handler
exports.webhookHandler = async (req, res) => {
  const webhookTimestamp = new Date().toISOString();
  console.log('🎯 [RAZORPAY WEBHOOK] ==========================================');
  console.log(`🎯 [RAZORPAY WEBHOOK] Webhook received at: ${webhookTimestamp}`);
  console.log('🎯 [RAZORPAY WEBHOOK] ==========================================');
  console.log('[Razorpay Webhook] Headers:', req.headers);
  console.log('[Razorpay Webhook] Body type:', typeof req.body);
  
  try {
    // Get the webhook secret from environment
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.warn('[Razorpay Webhook] No webhook secret configured, skipping signature verification');
    } else {
      // Verify webhook signature
      const receivedSignature = req.headers['x-razorpay-signature'];
      
      if (!receivedSignature) {
        console.error('[Razorpay Webhook] No signature provided');
        return res.status(400).json({ 
          success: false, 
          message: 'No signature provided' 
        });
      }

      // Create HMAC signature
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      console.log('[Razorpay Webhook] Signature verification:', {
        received: receivedSignature,
        expected: expectedSignature,
        match: receivedSignature === expectedSignature
      });

      if (receivedSignature !== expectedSignature) {
        console.error('[Razorpay Webhook] Invalid signature');
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid signature' 
        });
      }
    }

    console.log('✅ [RAZORPAY WEBHOOK] Signature verified successfully!');
    console.log('[Razorpay Webhook] Webhook data:', req.body);

    // Handle different webhook events
    const { event, payload } = req.body;
    
    console.log(`🎯 [RAZORPAY WEBHOOK] Processing event: ${event}`);
    
    if (event === 'payment.captured') {
      console.log('💰 [RAZORPAY WEBHOOK] Payment captured event - processing...');
      await handlePaymentCaptured(payload);
    } else if (event === 'payment.failed') {
      console.log('❌ [RAZORPAY WEBHOOK] Payment failed event - processing...');
      await handlePaymentFailed(payload);
    } else {
      console.log(`⚠️ [RAZORPAY WEBHOOK] Unhandled event type: ${event}`);
    }

    console.log('🎉 [RAZORPAY WEBHOOK] Webhook processed successfully!');
    console.log('🎯 [RAZORPAY WEBHOOK] ==========================================');
    
    // Always respond with success to acknowledge receipt
    res.json({ status: 'ok' });
    
  } catch (error) {
    console.error('[Razorpay Webhook] Error processing webhook:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Webhook processing failed',
      error: error.message 
    });
  }
};

// Handle payment captured event
async function handlePaymentCaptured(payload) {
  try {
    console.log('💰 [RAZORPAY WEBHOOK] ==========================================');
    console.log('💰 [RAZORPAY WEBHOOK] Processing payment.captured event');
    console.log('💰 [RAZORPAY WEBHOOK] ==========================================');
    
    const paymentEntity = payload.payment?.entity;
    const orderEntity = payload.order?.entity;
    
    if (!paymentEntity || !orderEntity) {
      console.error('❌ [RAZORPAY WEBHOOK] Invalid payload structure for payment.captured');
      return;
    }

    console.log('💰 [RAZORPAY WEBHOOK] Payment details:', {
      paymentId: paymentEntity.id,
      orderId: orderEntity.id,
      amount: paymentEntity.amount,
      status: paymentEntity.status,
      receipt: orderEntity.receipt,
      timestamp: new Date().toISOString()
    });

    // Find booking by receipt (which should contain booking ID)
    console.log('🔍 [RAZORPAY WEBHOOK] Looking up booking with receipt:', orderEntity.receipt);
    const booking = await Booking.findById(orderEntity.receipt);
    
    if (!booking) {
      console.warn('⚠️ [RAZORPAY WEBHOOK] Booking not found for receipt:', orderEntity.receipt);
      return;
    }

    console.log('📋 [RAZORPAY WEBHOOK] Found booking:', {
      customBookingId: booking.customBookingId,
      currentStatus: booking.paymentStatus,
      customerName: booking.name,
      amount: booking.totalAmount
    });

    // Check if booking is already confirmed
    if (booking.paymentStatus === 'Completed') {
      console.log('✅ [RAZORPAY WEBHOOK] Booking already confirmed:', booking.customBookingId);
      return;
    }

    // Update booking status
    console.log('💾 [RAZORPAY WEBHOOK] Updating booking status to Completed...');
    booking.paymentStatus = 'Completed';
    booking.paymentId = paymentEntity.id;
    booking.paymentType = 'Razorpay';
    await booking.save();

    console.log('🎉 [RAZORPAY WEBHOOK] ==========================================');
    console.log('🎉 [RAZORPAY WEBHOOK] BOOKING CONFIRMED SUCCESSFULLY!');
    console.log('🎉 [RAZORPAY WEBHOOK] ==========================================');
    console.log('🎉 [RAZORPAY WEBHOOK] Booking ID:', booking.customBookingId);
    console.log('🎉 [RAZORPAY WEBHOOK] Payment ID:', paymentEntity.id);
    console.log('🎉 [RAZORPAY WEBHOOK] Amount:', paymentEntity.amount);
    console.log('🎉 [RAZORPAY WEBHOOK] Customer:', booking.name);
    console.log('🎉 [RAZORPAY WEBHOOK] Status: COMPLETED');
    console.log('🎉 [RAZORPAY WEBHOOK] Timestamp:', new Date().toISOString());
    console.log('🎉 [RAZORPAY WEBHOOK] ==========================================');
    
    // Here you can add additional logic like:
    // - Send confirmation emails
    // - Update inventory
    // - Send notifications
    
  } catch (error) {
    console.error('❌ [RAZORPAY WEBHOOK] Error handling payment captured:', error);
    console.error('❌ [RAZORPAY WEBHOOK] Stack trace:', error.stack);
  }
}

// Handle payment failed event
async function handlePaymentFailed(payload) {
  try {
    console.log('❌ [RAZORPAY WEBHOOK] ==========================================');
    console.log('❌ [RAZORPAY WEBHOOK] Processing payment.failed event');
    console.log('❌ [RAZORPAY WEBHOOK] ==========================================');
    
    const paymentEntity = payload.payment?.entity;
    const orderEntity = payload.order?.entity;
    
    if (!paymentEntity || !orderEntity) {
      console.error('❌ [RAZORPAY WEBHOOK] Invalid payload structure for payment.failed');
      return;
    }

    console.log('❌ [RAZORPAY WEBHOOK] Payment failed details:', {
      paymentId: paymentEntity.id,
      orderId: orderEntity.id,
      amount: paymentEntity.amount,
      status: paymentEntity.status,
      receipt: orderEntity.receipt,
      timestamp: new Date().toISOString()
    });

    // Find booking by receipt
    console.log('🔍 [RAZORPAY WEBHOOK] Looking up booking with receipt:', orderEntity.receipt);
    const booking = await Booking.findById(orderEntity.receipt);
    
    if (!booking) {
      console.warn('⚠️ [RAZORPAY WEBHOOK] Booking not found for receipt:', orderEntity.receipt);
      return;
    }

    console.log('📋 [RAZORPAY WEBHOOK] Found booking:', {
      customBookingId: booking.customBookingId,
      currentStatus: booking.paymentStatus,
      customerName: booking.name,
      amount: booking.totalAmount
    });

    // Update booking status to failed
    console.log('💾 [RAZORPAY WEBHOOK] Updating booking status to Failed...');
    booking.paymentStatus = 'Failed';
    booking.paymentType = 'Razorpay';
    await booking.save();

    console.log('❌ [RAZORPAY WEBHOOK] ==========================================');
    console.log('❌ [RAZORPAY WEBHOOK] BOOKING MARKED AS FAILED');
    console.log('❌ [RAZORPAY WEBHOOK] ==========================================');
    console.log('❌ [RAZORPAY WEBHOOK] Booking ID:', booking.customBookingId);
    console.log('❌ [RAZORPAY WEBHOOK] Payment ID:', paymentEntity.id);
    console.log('❌ [RAZORPAY WEBHOOK] Amount:', paymentEntity.amount);
    console.log('❌ [RAZORPAY WEBHOOK] Customer:', booking.name);
    console.log('❌ [RAZORPAY WEBHOOK] Status: FAILED');
    console.log('❌ [RAZORPAY WEBHOOK] Timestamp:', new Date().toISOString());
    console.log('❌ [RAZORPAY WEBHOOK] ==========================================');
    
  } catch (error) {
    console.error('❌ [RAZORPAY WEBHOOK] Error handling payment failed:', error);
    console.error('❌ [RAZORPAY WEBHOOK] Stack trace:', error.stack);
  }
}

// Verify payment signature (for frontend verification)
exports.verifyPayment = async (req, res) => {
  try {
    console.log('🔐 [RAZORPAY VERIFY] ==========================================');
    console.log('🔐 [RAZORPAY VERIFY] Verifying payment signature');
    console.log('🔐 [RAZORPAY VERIFY] ==========================================');
    
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    console.log('🔐 [RAZORPAY VERIFY] Verification request:', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature ? 'PROVIDED' : 'MISSING',
      timestamp: new Date().toISOString()
    });
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.error('❌ [RAZORPAY VERIFY] Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Generate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isSignatureValid = expectedSignature === razorpay_signature;
    
    console.log('🔐 [RAZORPAY VERIFY] Signature verification:', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signatureValid: isSignatureValid,
      expectedSignature: expectedSignature.substring(0, 10) + '...',
      receivedSignature: razorpay_signature.substring(0, 10) + '...'
    });

    if (isSignatureValid) {
      console.log('✅ [RAZORPAY VERIFY] ==========================================');
      console.log('✅ [RAZORPAY VERIFY] PAYMENT VERIFICATION SUCCESSFUL!');
      console.log('✅ [RAZORPAY VERIFY] ==========================================');
      console.log('✅ [RAZORPAY VERIFY] Order ID:', razorpay_order_id);
      console.log('✅ [RAZORPAY VERIFY] Payment ID:', razorpay_payment_id);
      console.log('✅ [RAZORPAY VERIFY] Status: VERIFIED');
      console.log('✅ [RAZORPAY VERIFY] Timestamp:', new Date().toISOString());
      console.log('✅ [RAZORPAY VERIFY] ==========================================');
    } else {
      console.log('❌ [RAZORPAY VERIFY] ==========================================');
      console.log('❌ [RAZORPAY VERIFY] PAYMENT VERIFICATION FAILED!');
      console.log('❌ [RAZORPAY VERIFY] ==========================================');
      console.log('❌ [RAZORPAY VERIFY] Order ID:', razorpay_order_id);
      console.log('❌ [RAZORPAY VERIFY] Payment ID:', razorpay_payment_id);
      console.log('❌ [RAZORPAY VERIFY] Status: INVALID SIGNATURE');
      console.log('❌ [RAZORPAY VERIFY] Timestamp:', new Date().toISOString());
      console.log('❌ [RAZORPAY VERIFY] ==========================================');
    }

    res.json({
      success: isSignatureValid,
      message: isSignatureValid ? 'Payment verified successfully' : 'Invalid payment signature'
    });
    
  } catch (error) {
    console.error('❌ [RAZORPAY VERIFY] Error verifying payment:', error);
    console.error('❌ [RAZORPAY VERIFY] Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};
