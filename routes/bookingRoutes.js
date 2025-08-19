const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");

router.post("/create", bookingController.createBooking);
router.post("/verify", bookingController.verifyPayment);
router.get('/', bookingController.getOrdersByEmail);
router.get("/:id", bookingController.getSingleBooking);
router.get("/all", bookingController.getAllBookings);
router.post("/mine", bookingController.getUserBookings); // uses auth or body.email
router.get("/test/razorpay/config", bookingController.testRazorpayConfig);

module.exports = router;
