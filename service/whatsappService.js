const axios = require("axios");

async function sendWhatsAppMessage(order) {
  try {
    const response = await axios.post(
      `${process.env.RB_DIGITAL_BASE_URL}/v2/whatsapp-business/messages`,
    
  {
        to: order.customerPhone, 
        type: "template",
    
          name: "waterpark", // Template you got approved
          language: "en",
          headerParams: [
            {
              type: "image",
              url: "https://example.com/promo-image.jpg"
              
            }
          ],
          bodyParams: [
    "John",
    "50% OFF"
  ]

},
     



      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RB_DIGITAL_TOKEN}`
        }
      }
    );

    console.log("✅ WhatsApp message sent:", response.data);
  } catch (error) {
    console.error("❌ WhatsApp error:", error.response?.data || error.message);
  }
}

module.exports = { sendWhatsAppMessage };
