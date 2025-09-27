const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");

router.post("/create", bookingController.createBooking);
router.post("/test-email", bookingController.testEmail);
router.post("/confirm", bookingController.confirmPayment);
router.post("/confirm-and-notify", bookingController.confirmAndNotify);
router.post("/send-notifications", bookingController.sendNotifications);
router.post("/verify", bookingController.verifyPayment);
router.get('/email', bookingController.getOrdersByEmail);
router.get('/user-bookings', bookingController.getBookingsByEmailOrPhone); // New route for email OR phone
// New route for getting booking with ticket details (for sharing)
router.get("/ticket/:customBookingId", bookingController.getBookingWithTicket);
router.get("/:customBookingId", bookingController.getSingleBooking);
router.get("/", bookingController.getAllBookings);

router.post("/mine", bookingController.getUserBookings); // uses auth or body.email
router.get("/test/razorpay/config", bookingController.testRazorpayConfig);

module.exports = router;
