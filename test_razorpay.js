require('dotenv').config();
const Razorpay = require("razorpay");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
console.log(process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET);
const orderOptions = {
    amount: 100,
    currency: "INR",
    receipt: "test_receipt",
    payment_capture: 1,
    notes: {
      bookingId: "test_id",
      customBookingId: "test_custom_id",
      waterparkName: "test_name",
      customerName: "test_customer",
      customerEmail: "test_email",
      customerPhone: "1234567890",
      waternumber: "123"
    },
};
razorpay.orders.create(orderOptions).then(console.log).catch(console.error);
