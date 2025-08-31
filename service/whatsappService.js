const axios = require("axios");

async function sendWhatsAppMessage(order) {
  try {
    // Required fields for the WhatsApp template
    const requiredFields = {
      customerName: order.customerName,
      waterparkName: order.waterparkName,
      customerPhone: order.customerPhone,
      date: order.date,
      adultquantity: order.adultquantity,
      childquantity: order.childquantity,
      totalAmount: order.totalAmount,
      left: order.left,
    };

    // Check for missing or empty fields
    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => value === undefined || value === null || value === "")
      .map(([key]) => key);

    if (missingFields.length > 0) {
      console.error("⚠️ Missing data in order:", missingFields.join(", "));
    }

    // Convert values to strings safely
    const name = String(order.customerName || "");
    const park = String(order.waterparkName || "");
    const customerPhone = String(order.customerPhone || "");
    const date = String(order.date || "");
    const adult = String(order.adultquantity || "");
    const child = String(order.childquantity || "0");
    const total = String(order.totalAmount || "");
    const left = String(order.left || "0");

    console.log("📦 Sending WhatsApp with order data:", {
      name,
      park,
      customerPhone,
      date,
      adult,
      child,
      total,
      left,
    });

    // Send request
    const response = await axios.post(
      `${process.env.RB_DIGITAL_BASE_URL}/v2/whatsapp-business/messages`,
      {
        to: customerPhone,
        language: "en",
        name: "bill",
        phoneNoId: `${process.env.RB_DIGITAL_NUMBER_ID}`,
        type: "template",
        bodyParams: [name, park, date, adult, child, total, left],
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
