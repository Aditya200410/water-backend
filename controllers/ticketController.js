const Ticket = require("../models/Ticket");
const Booking = require("../models/Booking");

// Note: Ticket generation removed - tickets are now generated on-demand from frontend

/**
 * Get booking details for ticket generation (no ticket storage)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getTicket = async (req, res) => {
  try {
    console.log("[getTicket] Request params:", req.params);
    
    const { bookingId } = req.params;
    
    // Find the booking directly
    let booking = await Booking.findOne({ customBookingId: bookingId });
    
    if (!booking) {
      booking = await Booking.findById(bookingId);
    }
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }
    
    // Check if booking is completed
    if (booking.paymentStatus !== "Completed") {
      return res.status(400).json({
        success: false,
        message: "Booking not completed"
      });
    }
    
    console.log("[getTicket] Booking found:", booking.customBookingId);
    
    // Return booking data for frontend ticket generation
    return res.status(200).json({
      success: true,
      booking: {
        id: booking._id,
        customBookingId: booking.customBookingId,
        name: booking.name,
        email: booking.email,
        phone: booking.phone,
        waternumber: booking.waternumber,
        adults: booking.adults,
        children: booking.children,
        date: booking.date,
        bookingDate: booking.bookingDate,
        advanceAmount: booking.advanceAmount,
        totalAmount: booking.totalAmount,
        leftamount: booking.leftamount,
        waterparkName: booking.waterparkName
      }
    });
    
  } catch (error) {
    console.error("[getTicket] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get booking",
      error: error.message
    });
  }
};

/**
 * Get all completed bookings (admin only) - tickets generated on-demand
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getAllTickets = async (req, res) => {
  try {
    console.log("[getAllTickets] Fetching all completed bookings...");
    
    const bookings = await Booking.find({ paymentStatus: "Completed" })
      .select('customBookingId name email phone waterparkName date adults children totalAmount advanceAmount leftamount bookingDate')
      .sort({ bookingDate: -1 });
    
    console.log("[getAllTickets] Found completed bookings:", bookings.length);
    
    return res.status(200).json({
      success: true,
      bookings: bookings.map(booking => ({
        id: booking._id,
        customBookingId: booking.customBookingId,
        name: booking.name,
        email: booking.email,
        phone: booking.phone,
        waterparkName: booking.waterparkName,
        date: booking.date,
        adults: booking.adults,
        children: booking.children,
        totalAmount: booking.totalAmount,
        advanceAmount: booking.advanceAmount,
        leftamount: booking.leftamount,
        bookingDate: booking.bookingDate
      }))
    });
    
  } catch (error) {
    console.error("[getAllTickets] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get bookings",
      error: error.message
    });
  }
};

/**
 * Delete booking (admin only) - no tickets to delete since they're generated on-demand
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteTicket = async (req, res) => {
  try {
    console.log("[deleteTicket] Request params:", req.params);
    
    const { ticketId } = req.params;
    
    // Find booking by ID or customBookingId
    let booking = await Booking.findById(ticketId);
    
    if (!booking) {
      booking = await Booking.findOne({ customBookingId: ticketId });
    }
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }
    
    await Booking.findByIdAndDelete(booking._id);
    
    console.log("[deleteTicket] Booking deleted successfully:", booking.customBookingId);
    
    return res.status(200).json({
      success: true,
      message: "Booking deleted successfully"
    });
    
  } catch (error) {
    console.error("[deleteTicket] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete booking",
      error: error.message
    });
  }
};
