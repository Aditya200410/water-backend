const axios = require("axios");

async function sendWhatsAppMessage(order) {
  try {
    // Construct a plain text bill message with emojis
   const name = String(order.customerName || "");
const park = String(order.waterparkName || "");
const customerPhone = String(order.customerPhone || "");
const date = String(order.date || "");
const adult = String(order.adultquantity || "");
const child = String(order.childquantity || "");
const total = String(order.totalAmount || "");
const left = String(order.left || "");
console.log("whatsapp ", order)

    const response = await axios.post(
      `${process.env.RB_DIGITAL_BASE_URL}/v2/whatsapp-business/messages`,
      {
        
        to:customerPhone, // customer's WhatsApp number
        language: "en",
       name: "bill",
        phoneNoId: `${process.env.RB_DIGITAL_NUMBER_ID}`,
type: "template",
      bodyParams: [
   name,
   park,
    date,
   adult,
     child,
     total,
      left
   

      ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RB_DIGITAL_TOKEN}`,
        },
      }
    );

    console.log("✅ WhatsApp bill sent:", response.data);
  } catch (error) {
    console.error("❌ WhatsApp error:", error.response?.data || error.message);
  }
}

module.exports = { sendWhatsAppMessage };
