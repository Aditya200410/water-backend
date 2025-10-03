# Razorpay Webhook Setup Guide

This guide explains how to set up Razorpay webhooks in the waterpark project, following the pattern from your example code.

## Overview

The Razorpay webhook integration includes:
- Order creation endpoint
- Payment verification
- Webhook handler with signature verification
- Test components for frontend testing

## Backend Setup

### 1. Environment Variables

Add these to your `.env` file:

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

### 2. New Files Created

- `controllers/razorpayController.js` - Main Razorpay controller
- `routes/razorpay.js` - Razorpay routes
- `test-razorpay.js` - Standalone test server
- `test-webhook.js` - Webhook testing script

### 3. Updated Files

- `server.js` - Added Razorpay routes and webhook handling

## API Endpoints

### Create Order
```
POST /api/razorpay/create-order
Content-Type: application/json

{
  "amount": 499,
  "currency": "INR",
  "receipt": "optional_receipt_id"
}
```

### Verify Payment
```
POST /api/razorpay/verify-payment
Content-Type: application/json

{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_xxx"
}
```

### Webhook Handler
```
POST /api/razorpay/webhook
Content-Type: application/json
x-razorpay-signature: signature_xxx

{
  "event": "payment.captured",
  "payload": { ... }
}
```

## Frontend Integration

### 1. Test Component

A test component is available at `waterpark-frontend/src/components/RazorpayTest.jsx` that demonstrates:
- Loading Razorpay SDK
- Creating orders
- Handling payment responses
- Verifying payments

### 2. Test Page

Access the test page at `/razorpay-test` to test the integration.

## Webhook Configuration

### 1. Razorpay Dashboard Setup

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/razorpay/webhook`
3. Select events: `payment.captured`, `payment.failed`
4. Copy the webhook secret to your environment variables

### 2. Local Testing

For local testing, use ngrok or similar:

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 5000

# Use the ngrok URL in Razorpay dashboard
# Example: https://abc123.ngrok.io/api/razorpay/webhook
```

## Testing

### 1. Test Order Creation

```bash
curl -X POST http://localhost:5000/api/razorpay/create-order \
  -H "Content-Type: application/json" \
  -d '{"amount": 499, "currency": "INR"}'
```

### 2. Test Webhook

```bash
node test-webhook.js
```

### 3. Frontend Testing

1. Start the frontend: `npm run dev`
2. Navigate to `/razorpay-test`
3. Fill in test details and click "Pay"
4. Use Razorpay test credentials

## Security Features

### 1. Signature Verification

The webhook handler verifies Razorpay signatures using HMAC-SHA256:

```javascript
const expectedSignature = crypto
  .createHmac('sha256', webhookSecret)
  .update(rawBody)
  .digest('hex');
```

### 2. Raw Body Parsing

Webhook routes use raw body parsing to ensure proper signature verification:

```javascript
app.post('/api/razorpay/webhook', 
  express.raw({ type: 'application/json' }), 
  razorpayController.webhookHandler
);
```

## Error Handling

The implementation includes comprehensive error handling:
- Invalid signatures
- Missing required fields
- Database errors
- Network timeouts

## Integration with Existing Booking System

The webhook handler integrates with the existing booking system:
- Updates booking status to "Completed" on successful payment
- Handles payment failures
- Maintains backward compatibility with existing webhook endpoint

## Monitoring and Logging

All webhook events are logged with:
- Timestamp
- Event type
- Payment details
- Processing status
- Error messages

## Production Considerations

1. **HTTPS Required**: Razorpay webhooks require HTTPS in production
2. **Webhook Secret**: Always use a strong, unique webhook secret
3. **Idempotency**: Handle duplicate webhook events gracefully
4. **Timeout**: Set appropriate timeouts for webhook processing
5. **Monitoring**: Monitor webhook success/failure rates

## Troubleshooting

### Common Issues

1. **Signature Verification Failed**
   - Check webhook secret configuration
   - Ensure raw body parsing is used
   - Verify payload format

2. **Webhook Not Receiving Events**
   - Check webhook URL configuration
   - Verify HTTPS is enabled
   - Check firewall/network settings

3. **Order Creation Failed**
   - Verify Razorpay credentials
   - Check amount format (should be in paise)
   - Ensure proper error handling

### Debug Mode

Enable debug logging by setting:
```env
DEBUG=razorpay:*
```

## Example Usage

### Frontend Integration

```javascript
// Load Razorpay SDK
const res = await loadScript('https://checkout.razorpay.com/v1/checkout.js');

// Create order
const orderResponse = await fetch('/api/razorpay/create-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 499, currency: 'INR' })
});

const order = await orderResponse.json();

// Initialize payment
const options = {
  key: 'rzp_test_xxx',
  amount: order.amount,
  currency: order.currency,
  order_id: order.id,
  handler: function(response) {
    // Handle successful payment
    console.log('Payment successful:', response);
  }
};

const paymentObject = new window.Razorpay(options);
paymentObject.open();
```

This setup provides a complete Razorpay webhook integration that follows the pattern from your example while integrating seamlessly with the existing waterpark booking system.
