const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");

router.post("/create", bookingController.createBooking);
router.post("/verify", bookingController.verifyPayment);
router.post("/phonepe/callback", bookingController.phonePeCallback);
router.get('/email', bookingController.getOrdersByEmail);
router.get('/user-bookings', bookingController.getBookingsByEmailOrPhone); // New route for email OR phone
// New route for getting booking with ticket details (for sharing)
router.get("/ticket/:customBookingId", bookingController.getBookingWithTicket);
router.get("/status/:customBookingId", bookingController.getBookingStatus); // Check booking status (any status)
router.get("/any/:customBookingId", bookingController.getSingleBookingAnyStatus); // Get booking any status (for verification)
router.get("/:customBookingId", bookingController.getSingleBooking);
router.get("/", bookingController.getAllBookings);

router.post("/mine", bookingController.getUserBookings); // uses auth or body.email
router.get("/test/razorpay/config", bookingController.testRazorpayConfig);
router.post("/test/webhook", bookingController.testWebhook);

module.exports = router;
