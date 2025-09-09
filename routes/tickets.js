const express = require("express");
const router = express.Router();
const {
  getTicket,
  getAllTickets,
  deleteTicket
} = require("../controllers/ticketController");
const { auth } = require("../middleware/auth");

// Note: Ticket generation removed - tickets are now generated on-demand from frontend

// Note: Test endpoints removed - tickets are now generated on-demand from frontend

// Admin routes (must come before parameterized routes)
router.get("/", auth, getAllTickets);

// Get ticket by booking ID or custom booking ID
router.get("/:bookingId", getTicket);

// Delete ticket (admin only)
router.delete("/:ticketId", auth, deleteTicket);

module.exports = router;
