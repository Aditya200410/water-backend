const axios = require("axios");

async function parkWhatsAppMessage(order) {
  try {

    function normalize(value) {
  if (value === undefined || value === null) return "0";
  const str = String(value).trim();
  return str === "" ? "0" : str;
}
    // Required fields for the WhatsApp template
  const normalized = {
      customBookingId: normalize(order.customBookingId),
      customerName: normalize(order.customerName),
      waterparkName: normalize(order.waterparkName),
      customerPhone: normalize(order.customerPhone),
      waternumber:normalize(order.waternumber),
      date: order.date
        ? new Date(order.date).toLocaleDateString("en-IN")
        : "0",
      adultquantity: normalize(order.adultquantity),
      childquantity: normalize(order.childquantity),
      totalAmount: normalize(order.totalAmount),
      left: normalize(order.left),
    };


    // Save globally
    global.lastWhatsAppPayload = normalized;

    console.log("📦 [WhatsApp] Sending message with:", normalized);
   

    // Send request
    const response = await axios.post(
      `${process.env.RB_DIGITAL_BASE_URL}/v2/whatsapp-business/messages`,
      {
        to: normalized.waternumber,
        language: "en",
        name: "bill",
        phoneNoId: `${process.env.RB_DIGITAL_NUMBER_ID}`,
        type: "template",
        bodyParams: [normalized.customerName,
          normalized.waterparkName,
          normalized.date,
          normalized.customBookingId,
          normalized.adultquantity,
          normalized.childquantity,
          normalized.totalAmount,
          normalized.left,],
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

module.exports = { parkWhatsAppMessage };
