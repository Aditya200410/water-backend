// testWebhook.js
const crypto = require('crypto');
const axios = require('axios');

// =================================================================
// --- ⚙️ CONFIGURATION - UPDATE THESE VALUES ---
// =================================================================

// The full URL to your running webhook endpoint
const WEBHOOK_URL = 'https://api.waterparkchalo.com/api/bookings/webhook/razorpay';

// ⬇️ 1. REPLACE THIS with your actual secret from the Razorpay Dashboard.
const WEBHOOK_SECRET = 'RAZORPAY';

// ⬇️ 2. REPLACE THIS with a REAL booking ID from your database.
const BOOKING_ID_TO_TEST = '68d96aae4aad9e1f6635da2b';

// ⬇️ 3. CHOOSE WHICH EVENT TO TEST: 'payment.captured' or 'payment.failed'
const EVENT_TO_TEST = 'payment.captured'; // <-- Change to 'payment.failed' to test failures

// =================================================================
// --- SCRIPT LOGIC - NO NEED TO EDIT BELOW ---
// =================================================================

/**
 * Creates a mock Razorpay payload for a given event type.
 * @param {string} bookingId - The booking ID to be used as the order receipt.
 * @param {('payment.captured'|'payment.failed')} eventType - The type of event to simulate.
 * @returns {object} A mock Razorpay payload.
 */
function createMockPayload(bookingId, eventType) {
  const basePayload = {
      order: {
        entity: {
          id: `order_${Math.random().toString(36).substr(2, 9)}`,
          entity: 'order',
          amount: 50000,
          currency: 'INR',
          receipt: bookingId,
          status: eventType === 'payment.captured' ? 'paid' : 'created',
          attempts: 1,
        },
      },
  };

  if (eventType === 'payment.captured') {
    return {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_${Math.random().toString(36).substr(2, 9)}`,
            entity: 'payment',
            amount: 50000,
            currency: 'INR',
            status: 'captured',
            order_id: basePayload.order.entity.id,
            international: false,
            method: 'upi',
            captured: true,
            email: 'test.customer@example.com',
            contact: '+919876543210',
          },
        },
        ...basePayload,
      },
    };
  } else { // 'payment.failed'
    return {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_${Math.random().toString(36).substr(2, 9)}`,
            entity: 'payment',
            amount: 50000,
            currency: 'INR',
            status: 'failed',
            order_id: basePayload.order.entity.id,
            international: false,
            method: 'upi',
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Payment failed due to invalid VPA.',
            error_reason: 'invalid_vpa',
            email: 'test.customer@example.com',
            contact: '+919876543210',
          },
        },
        ...basePayload,
      },
    };
  }
}

/**
 * Main function to generate signature and send the webhook.
 */
async function sendTestWebhook() {
  console.log(`🚀 Starting webhook test for event: ${EVENT_TO_TEST}`);

  // Correctly check if the secret is still the placeholder
  if (WEBHOOK_SECRET === 'your_webhook_secret_here' || !WEBHOOK_SECRET) {
    console.error('\n❌ ERROR: Please update the WEBHOOK_SECRET variable in the script with your real key.');
    return;
  }

  // 1. Create the payload and convert it to a JSON string
  const payload = createMockPayload(BOOKING_ID_TO_TEST, EVENT_TO_TEST);
  const payloadString = JSON.stringify(payload);
  console.log('\n📋 Generated Payload:');
  console.log(payloadString);

  // 2. Generate the HMAC signature using the configured secret variable
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET) // <-- FIX: Using the variable now
    .update(payloadString)
    .digest('hex');
  console.log(`\n🔑 Generated Signature: ${expectedSignature}`);

  // 3. Send the POST request
  try {
    console.log(`\n📡 Sending POST request to: ${WEBHOOK_URL}`);
    const response = await axios.post(WEBHOOK_URL, payloadString, {
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': expectedSignature,
      },
    });

    console.log('\n✅ Webhook request successful!');
    console.log(`   - Status: ${response.status}`);
    console.log('   - Response Body:', response.data);
  } catch (error) {
    console.error('\n❌ Webhook request failed!');
    if (error.response) {
      console.error(`   - Status: ${error.response.status}`);
      console.error('   - Response Body:', error.response.data);
    } else if (error.request) {
      console.error('   - Error: No response received. Is the server running and the URL correct?');
    } else {
      console.error('   - Error:', error.message);
    }
  }
}

// Run the test
sendTestWebhook();