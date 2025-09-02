const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");

router.post("/create", bookingController.createBooking);
router.post("/verify", bookingController.verifyPayment);
router.get('/email', bookingController.getOrdersByEmail);
router.get("/:customBookingId", bookingController.getSingleBooking);
router.get("/", bookingController.getAllBookings);

router.post("/mine", bookingController.getUserBookings); // uses auth or body.email
router.get("/test/razorpay/config", bookingController.testRazorpayConfig);

module.exports = router;
