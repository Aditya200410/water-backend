const express = require("express");
const router = express.Router();
const {
  generateTicket,
  getTicket,
  getAllTickets,
  deleteTicket
} = require("../controllers/ticketController");
const { auth } = require("../middleware/auth");

// Generate ticket after booking verification
router.post("/generate", generateTicket);

// Simple test endpoint to check ticket generation
router.post("/test/:customBookingId", async (req, res) => {
  try {
    const { customBookingId } = req.params;
    const Booking = require("../models/Booking");
    const { generateAndUploadTicket } = require("../services/ticketService");
    
    console.log(`[test] Testing ticket generation for: ${customBookingId}`);
    
    // Find the booking
    const booking = await Booking.findOne({ customBookingId });
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    
    console.log(`[test] Found booking: ${booking.name}`);
    
    // Test ticket generation
    const ticketData = await generateAndUploadTicket(booking);
    
    res.json({ 
      success: true, 
      message: "Ticket generation test successful",
      ticketData: {
        ticketPdfUrl: ticketData.ticketPdfUrl,
        cloudinaryPublicId: ticketData.cloudinaryPublicId
      }
    });
  } catch (error) {
    console.error("Error in test endpoint:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint to regenerate ticket for existing booking
router.post("/regenerate/:customBookingId", async (req, res) => {
  try {
    const { customBookingId } = req.params;
    const Booking = require("../models/Booking");
    const Ticket = require("../models/Ticket");
    const { generateAndUploadTicket } = require("../services/ticketService");
    
    console.log(`[regenerate] Starting regeneration for booking: ${customBookingId}`);
    
    // Find the booking
    const booking = await Booking.findOne({ customBookingId });
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    
    console.log(`[regenerate] Found booking: ${booking.name}`);
    
    // Delete existing ticket if any
    const deletedTicket = await Ticket.findOneAndDelete({ customBookingId });
    if (deletedTicket) {
      console.log(`[regenerate] Deleted existing ticket: ${deletedTicket._id}`);
    }
    
    // Generate new ticket
    console.log(`[regenerate] Generating new ticket...`);
    const ticketData = await generateAndUploadTicket(booking);
    console.log(`[regenerate] Ticket generated, URL: ${ticketData.ticketPdfUrl}`);
    
    // Create new ticket record
    const ticket = new Ticket({
      bookingId: booking._id,
      customBookingId: booking.customBookingId,
      ticketPdfUrl: ticketData.ticketPdfUrl,
      cloudinaryPublicId: ticketData.cloudinaryPublicId,
      status: "generated"
    });
    
    await ticket.save();
    console.log(`[regenerate] Ticket saved to database: ${ticket._id}`);
    
    res.json({ 
      success: true, 
      message: "Ticket regenerated successfully",
      ticket: {
        id: ticket._id,
        customBookingId: ticket.customBookingId,
        ticketPdfUrl: ticket.ticketPdfUrl,
        generatedAt: ticket.generatedAt
      }
    });
  } catch (error) {
    console.error("Error regenerating ticket:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin routes (must come before parameterized routes)
router.get("/", auth, getAllTickets);

// Get ticket by booking ID or custom booking ID
router.get("/:bookingId", getTicket);

// Delete ticket (admin only)
router.delete("/:ticketId", auth, deleteTicket);

module.exports = router;
