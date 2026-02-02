const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

async function testWebhook() {
    const PORT = process.env.PORT || 5175;
    const BASE_URL = `http://localhost:${PORT}`;
    const WEBHOOK_URL = `${BASE_URL}/api/bookings/webhook/phonepe`;

    console.log('Testing PhonePe Webhook at:', WEBHOOK_URL);

    // 1. Get Credentials
    const username = process.env.PHONEPE_WEBHOOK_USERNAME;
    const password = process.env.PHONEPE_WEBHOOK_PASSWORD;

    if (!username || !password) {
        console.error('❌ Error: PHONEPE_WEBHOOK_USERNAME or PHONEPE_WEBHOOK_PASSWORD not set in .env');
        console.log('Please set these variables to test the webhook signature verification.');
        return;
    }

    console.log(`Using credentials: ${username} : ****`);

    // 2. Generate Authorization Header
    // SHA256(username:password)
    const authHeader = crypto.createHash('sha256')
        .update(`${username}:${password}`)
        .digest('hex');

    console.log('Generated Auth Header:', authHeader);

    // 3. Create Mock Payload
    const mockPayload = {
        event: 'checkout.order.completed',
        payload: {
            merchantId: 'TEST_MERCHANT',
            merchantOrderId: 'TEST_ORDER_' + Date.now(),
            transactionId: 'TXN_' + Date.now(),
            state: 'COMPLETED',
            amount: 10000,
            paymentDetails: [
                {
                    paymentMode: 'UPI',
                    transactionId: 'TXN_' + Date.now(),
                    state: 'COMPLETED'
                }
            ]
        }
    };

    try {
        // 4. Send Request
        const response = await axios.post(WEBHOOK_URL, mockPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            }
        });

        console.log('\n✅ Webhook Request Successful!');
        console.log('Status:', response.status);
        console.log('Response:', response.data);

        if (response.data.message === 'Booking not found') {
            console.log('\nℹ️ Note: "Booking not found" is expected because we used a fake merchantOrderId.');
            console.log('This confirms the webhook endpoint is reachable and signature verification passed.');
        }

    } catch (error) {
        console.error('\n❌ Webhook Request Failed');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);

            if (error.response.status === 401) {
                console.error('Reason: Unauthorized. Check if your .env credentials match the ones used to generate the hash.');
            }
        } else {
            console.error('Error:', error.message);
        }
    }
}

testWebhook();
