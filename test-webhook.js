const crypto = require('crypto');

// Test webhook signature generation
function testWebhookSignature() {
  const webhookSecret = '12345678'; // Test secret
  const payload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_test123',
          amount: 49900,
          status: 'captured'
        }
      },
      order: {
        entity: {
          id: 'order_test123',
          receipt: 'test_receipt_123'
        }
      }
    }
  };

  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadString)
    .digest('hex');

  console.log('Test webhook payload:', payloadString);
  console.log('Generated signature:', signature);
  console.log('Use this signature in x-razorpay-signature header for testing');
  
  return { payload, signature };
}

// Test the webhook endpoint
async function testWebhookEndpoint() {
  const { payload, signature } = testWebhookSignature();
  
  try {
    const response = await fetch('http://localhost:5000/api/razorpay/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('Webhook test response:', result);
    console.log('Status:', response.status);
  } catch (error) {
    console.error('Webhook test error:', error.message);
  }
}

// Test order creation
async function testOrderCreation() {
  try {
    const response = await fetch('http://localhost:5000/api/razorpay/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: 499,
        currency: 'INR',
        receipt: `test_${Date.now()}`
      })
    });

    const result = await response.json();
    console.log('Order creation test response:', result);
    console.log('Status:', response.status);
  } catch (error) {
    console.error('Order creation test error:', error.message);
  }
}

// Run tests
console.log('=== Razorpay Webhook Test ===');
console.log('1. Testing signature generation...');
testWebhookSignature();

console.log('\n2. Testing order creation...');
testOrderCreation().then(() => {
  console.log('\n3. Testing webhook endpoint...');
  testWebhookEndpoint();
});

module.exports = {
  testWebhookSignature,
  testWebhookEndpoint,
  testOrderCreation
};
