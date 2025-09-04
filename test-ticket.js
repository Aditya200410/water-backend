const mongoose = require("mongoose");
const Booking = require("./models/Booking");

// Connect to MongoDB
mongoose.connect("mongodb://localhost:27017/waterpark", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const testBooking = {
  customBookingId: "TEST-" + Date.now(),
  waterparkName: "Aqua Paradise Water Park",
  paymentType: "Razorpay",
  name: "John Doe",
  email: "john.doe@example.com",
  phone: "+91 98765 43210",
  date: new Date("2024-02-15"),
  bookingDate: new Date(),
  adults: 2,
  children: 1,
  waternumber: "WP001",
  advanceAmount: 1500,
  totalAmount: 3000,
  leftamount: 1500,
  paymentId: "pay_test123",
  paymentStatus: "Success",
  terms: "Please carry cash for remaining payment.\nDrinking is strictly prohibited.\nPickup and drop service not included.\nWaterpark holds final decision.\nContact 1 day before check-in for refunds."
};

async function createTestBooking() {
  try {
    // Remove any existing test booking
    await Booking.deleteOne({ customBookingId: testBooking.customBookingId });
    
    // Create new test booking
    const booking = new Booking(testBooking);
    await booking.save();
    
    console.log("✅ Test booking created successfully!");
    console.log(`📋 Booking ID: ${testBooking.customBookingId}`);
    console.log(`🌐 Test URL: http://localhost:3000/ticket?bookingId=${testBooking.customBookingId}`);
    console.log("\n📱 You can now test the ticket design by visiting the URL above.");
    
  } catch (error) {
    console.error("❌ Error creating test booking:", error.message);
  } finally {
    mongoose.connection.close();
  }
}

createTestBooking();

