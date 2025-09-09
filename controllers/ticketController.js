const Ticket = require("../models/Ticket");
const Booking = require("../models/Booking");
const { generateTicketPDF } = require("../services/ticketService");

/**
 * Generate and store ticket PDF after booking verification
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.generateTicket = async (req, res) => {
  try {
    console.log("[generateTicket] Request body:", req.body);
    
    const { bookingId, customBookingId } = req.body;
    
    if (!bookingId && !customBookingId) {
      return res.status(400).json({
        success: false,
        message: "Either bookingId or customBookingId is required"
      });
    }
    
    // Find the booking
    let booking;
    if (customBookingId) {
      booking = await Booking.findOne({ customBookingId });
    } else {
      booking = await Booking.findById(bookingId);
    }
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }
    
    // Check if booking is verified/completed
    if (booking.paymentStatus !== "Completed") {
      return res.status(400).json({
        success: false,
        message: "Booking must be verified before generating ticket"
      });
    }
    
    // Check if ticket already exists
    const existingTicket = await Ticket.findOne({ 
      $or: [
        { bookingId: booking._id },
        { customBookingId: booking.customBookingId }
      ]
    });
    
    if (existingTicket) {
      return res.status(200).json({
        success: true,
        message: "Ticket already exists",
        ticket: existingTicket
      });
    }
    
    // Generate ticket PDF locally
    console.log("[generateTicket] Generating ticket for booking:", booking.customBookingId);
    const ticketData = await generateTicketPDF(booking);
    
    // Create ticket record in database (no PDF URL stored)
    const ticket = new Ticket({
      bookingId: booking._id,
      customBookingId: booking.customBookingId,
      status: "generated"
    });
    
    await ticket.save();
    
    console.log("[generateTicket] Ticket generated and saved successfully:", ticket._id);
    
    return res.status(201).json({
      success: true,
      message: "Ticket generated successfully",
      ticket: {
        id: ticket._id,
        customBookingId: ticket.customBookingId,
        generatedAt: ticket.generatedAt,
        status: ticket.status
      }
    });
    
  } catch (error) {
    console.error("[generateTicket] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate ticket",
      error: error.message
    });
  }
};

/**
 * Get ticket by booking ID or custom booking ID and generate PDF for download
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getTicket = async (req, res) => {
  try {
    console.log("[getTicket] Request params:", req.params);
    
    const { bookingId } = req.params;
    
    // Try to find by custom booking ID first, then by ObjectId
    let ticket = await Ticket.findOne({ customBookingId: bookingId });
    
    if (!ticket) {
      ticket = await Ticket.findById(bookingId);
    }
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }
    
    // Get the booking data to generate PDF
    const booking = await Booking.findById(ticket.bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }
    
    // Generate PDF for download
    console.log("[getTicket] Generating PDF for download:", ticket.customBookingId);
    const ticketData = await generateTicketPDF(booking);
    
    // Update download count and last downloaded time
    ticket.downloadCount += 1;
    ticket.lastDownloadedAt = new Date();
    ticket.status = "downloaded";
    await ticket.save();
    
    console.log("[getTicket] PDF generated and download count updated:", ticket.customBookingId);
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="waterpark-ticket-${ticket.customBookingId}.pdf"`);
    res.setHeader('Content-Length', ticketData.ticketPdfBuffer.length);
    
    // Send the PDF buffer
    res.send(ticketData.ticketPdfBuffer);
    
  } catch (error) {
    console.error("[getTicket] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get ticket",
      error: error.message
    });
  }
};

/**
 * Get all tickets (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getAllTickets = async (req, res) => {
  try {
    console.log("[getAllTickets] Fetching all tickets...");
    
    const tickets = await Ticket.find()
      .populate('bookingId', 'name email phone waterparkName date adults children totalAmount')
      .sort({ createdAt: -1 });
    
    console.log("[getAllTickets] Found tickets:", tickets.length);
    
    return res.status(200).json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        customBookingId: ticket.customBookingId,
        generatedAt: ticket.generatedAt,
        status: ticket.status,
        downloadCount: ticket.downloadCount,
        lastDownloadedAt: ticket.lastDownloadedAt,
        booking: ticket.bookingId
      }))
    });
    
  } catch (error) {
    console.error("[getAllTickets] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get tickets",
      error: error.message
    });
  }
};

/**
 * Delete ticket (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteTicket = async (req, res) => {
  try {
    console.log("[deleteTicket] Request params:", req.params);
    
    const { ticketId } = req.params;
    
    const ticket = await Ticket.findById(ticketId);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }
    
    // TODO: Delete from Cloudinary as well
    // For now, just delete from database
    await Ticket.findByIdAndDelete(ticketId);
    
    console.log("[deleteTicket] Ticket deleted successfully:", ticketId);
    
    return res.status(200).json({
      success: true,
      message: "Ticket deleted successfully"
    });
    
  } catch (error) {
    console.error("[deleteTicket] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete ticket",
      error: error.message
    });
  }
};
