# Razorpay Webhook Logging Implementation

## Overview

Comprehensive logging has been implemented for the Razorpay webhook integration to provide clear visibility into when webhooks are used and when they are successful.

## Logging Features

### 🎯 **Webhook Handler Logging**

When a webhook is received, you'll see:
```
🎯 [RAZORPAY WEBHOOK] ==========================================
🎯 [RAZORPAY WEBHOOK] Webhook received at: 2025-01-01T12:00:00.000Z
🎯 [RAZORPAY WEBHOOK] ==========================================
✅ [RAZORPAY WEBHOOK] Signature verified successfully!
🎯 [RAZORPAY WEBHOOK] Processing event: payment.captured
💰 [RAZORPAY WEBHOOK] Payment captured event - processing...
🎉 [RAZORPAY WEBHOOK] Webhook processed successfully!
```

### 💰 **Payment Captured Event Logging**

For successful payments:
```
💰 [RAZORPAY WEBHOOK] ==========================================
💰 [RAZORPAY WEBHOOK] Processing payment.captured event
💰 [RAZORPAY WEBHOOK] ==========================================
💰 [RAZORPAY WEBHOOK] Payment details: {
  paymentId: 'pay_1234567890',
  orderId: 'order_1234567890',
  amount: 49900,
  status: 'captured',
  receipt: 'booking_123',
  timestamp: '2025-01-01T12:00:00.000Z'
}
🔍 [RAZORPAY WEBHOOK] Looking up booking with receipt: booking_123
📋 [RAZORPAY WEBHOOK] Found booking: {
  customBookingId: 'WP20250101001',
  currentStatus: 'Pending',
  customerName: 'John Doe',
  amount: 499
}
💾 [RAZORPAY WEBHOOK] Updating booking status to Completed...
🎉 [RAZORPAY WEBHOOK] ==========================================
🎉 [RAZORPAY WEBHOOK] BOOKING CONFIRMED SUCCESSFULLY!
🎉 [RAZORPAY WEBHOOK] ==========================================
🎉 [RAZORPAY WEBHOOK] Booking ID: WP20250101001
🎉 [RAZORPAY WEBHOOK] Payment ID: pay_1234567890
🎉 [RAZORPAY WEBHOOK] Amount: 49900
🎉 [RAZORPAY WEBHOOK] Customer: John Doe
🎉 [RAZORPAY WEBHOOK] Status: COMPLETED
🎉 [RAZORPAY WEBHOOK] Timestamp: 2025-01-01T12:00:00.000Z
🎉 [RAZORPAY WEBHOOK] ==========================================
```

### ❌ **Payment Failed Event Logging**

For failed payments:
```
❌ [RAZORPAY WEBHOOK] ==========================================
❌ [RAZORPAY WEBHOOK] Processing payment.failed event
❌ [RAZORPAY WEBHOOK] ==========================================
❌ [RAZORPAY WEBHOOK] Payment failed details: {
  paymentId: 'pay_1234567890',
  orderId: 'order_1234567890',
  amount: 49900,
  status: 'failed',
  receipt: 'booking_123',
  timestamp: '2025-01-01T12:00:00.000Z'
}
🔍 [RAZORPAY WEBHOOK] Looking up booking with receipt: booking_123
📋 [RAZORPAY WEBHOOK] Found booking: {
  customBookingId: 'WP20250101001',
  currentStatus: 'Pending',
  customerName: 'John Doe',
  amount: 499
}
💾 [RAZORPAY WEBHOOK] Updating booking status to Failed...
❌ [RAZORPAY WEBHOOK] ==========================================
❌ [RAZORPAY WEBHOOK] BOOKING MARKED AS FAILED
❌ [RAZORPAY WEBHOOK] ==========================================
❌ [RAZORPAY WEBHOOK] Booking ID: WP20250101001
❌ [RAZORPAY WEBHOOK] Payment ID: pay_1234567890
❌ [RAZORPAY WEBHOOK] Amount: 49900
❌ [RAZORPAY WEBHOOK] Customer: John Doe
❌ [RAZORPAY WEBHOOK] Status: FAILED
❌ [RAZORPAY WEBHOOK] Timestamp: 2025-01-01T12:00:00.000Z
❌ [RAZORPAY WEBHOOK] ==========================================
```

### 🛒 **Order Creation Logging**

When creating orders:
```
🛒 [RAZORPAY ORDER] ==========================================
🛒 [RAZORPAY ORDER] Creating new Razorpay order
🛒 [RAZORPAY ORDER] ==========================================
🛒 [RAZORPAY ORDER] Order request: {
  amount: 499,
  currency: 'INR',
  receipt: 'test_123',
  timestamp: '2025-01-01T12:00:00.000Z'
}
🛒 [RAZORPAY ORDER] Order options: {
  amount: 49900,
  currency: 'INR',
  receipt: 'test_123',
  payment_capture: 1
}
✅ [RAZORPAY ORDER] ==========================================
✅ [RAZORPAY ORDER] ORDER CREATED SUCCESSFULLY!
✅ [RAZORPAY ORDER] ==========================================
✅ [RAZORPAY ORDER] Order ID: order_1234567890
✅ [RAZORPAY ORDER] Amount: 49900
✅ [RAZORPAY ORDER] Currency: INR
✅ [RAZORPAY ORDER] Receipt: test_123
✅ [RAZORPAY ORDER] Status: created
✅ [RAZORPAY ORDER] Timestamp: 2025-01-01T12:00:00.000Z
✅ [RAZORPAY ORDER] ==========================================
```

### 🔐 **Payment Verification Logging**

When verifying payments:
```
🔐 [RAZORPAY VERIFY] ==========================================
🔐 [RAZORPAY VERIFY] Verifying payment signature
🔐 [RAZORPAY VERIFY] ==========================================
🔐 [RAZORPAY VERIFY] Verification request: {
  orderId: 'order_1234567890',
  paymentId: 'pay_1234567890',
  signature: 'PROVIDED',
  timestamp: '2025-01-01T12:00:00.000Z'
}
🔐 [RAZORPAY VERIFY] Signature verification: {
  orderId: 'order_1234567890',
  paymentId: 'pay_1234567890',
  signatureValid: true,
  expectedSignature: 'a1b2c3d4e5...',
  receivedSignature: 'a1b2c3d4e5...'
}
✅ [RAZORPAY VERIFY] ==========================================
✅ [RAZORPAY VERIFY] PAYMENT VERIFICATION SUCCESSFUL!
✅ [RAZORPAY VERIFY] ==========================================
✅ [RAZORPAY VERIFY] Order ID: order_1234567890
✅ [RAZORPAY VERIFY] Payment ID: pay_1234567890
✅ [RAZORPAY VERIFY] Status: VERIFIED
✅ [RAZORPAY VERIFY] Timestamp: 2025-01-01T12:00:00.000Z
✅ [RAZORPAY VERIFY] ==========================================
```

## Logging Benefits

### 📊 **Clear Visibility**
- Easy to spot when webhooks are received
- Clear indication of success/failure
- Detailed information about each step

### 🔍 **Easy Debugging**
- Timestamps for all operations
- Detailed error messages with stack traces
- Step-by-step process tracking

### 📈 **Monitoring**
- Easy to grep for specific events
- Clear success/failure indicators
- Comprehensive audit trail

### 🎨 **Visual Clarity**
- Emojis for quick visual identification
- Separator lines for easy reading
- Color-coded success/error states

## Usage

The logging is automatically active when the server runs. You'll see these logs in your server console whenever:

1. **Orders are created** via `/api/razorpay/create-order`
2. **Payments are verified** via `/api/razorpay/verify-payment`
3. **Webhooks are received** via `/api/razorpay/webhook`

## Log Levels

- **🎯** Webhook events
- **💰** Payment captured events
- **❌** Payment failed events
- **🛒** Order creation
- **🔐** Payment verification
- **✅** Success operations
- **⚠️** Warnings
- **🔍** Lookup operations
- **📋** Data found
- **💾** Database operations

This comprehensive logging system provides complete visibility into the Razorpay webhook integration, making it easy to monitor, debug, and verify that webhooks are working correctly.
