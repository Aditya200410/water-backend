const Booking = require('../models/Booking');
const fs = require('fs').promises;
const path = require('path');
const bookingsJsonPath = path.join(__dirname, '../data/bookings.json');
const nodemailer = require('nodemailer');

// Setup nodemailer transporter (reuse config from auth.js)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Create a new booking (legacy order endpoint for backwards compatibility)
const createOrder = async (req, res) => {
  try {
    const {
      waterpark,
      waternumber,
      name,
      email,
      phone,
      date,
      adults,
      children,
      advanceAmount,
      paymentType,
      paymentMethod,
      waterparkName,
      total,
      terms,
      paymentStatus
    } = req.body;

    // Comprehensive validation for booking
    const requiredFields = ['waterpark', 'name', 'email', 'phone', 'date', 'advanceAmount', 'paymentType', 'waterparkName', 'total'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Generate custom booking ID
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 1000);
    const customBookingId = `WP${timestamp}${randomNum}`;

    // Map paymentStatus to valid enum values
    let mappedPaymentStatus = paymentStatus || 'pending';
    if (paymentStatus === 'partial' || paymentStatus === 'processing') {
      mappedPaymentStatus = 'pending';
    }
    if (!['pending', 'completed', 'failed'].includes(mappedPaymentStatus)) {
      mappedPaymentStatus = 'pending';
    }

    const newBooking = new Booking({
      customBookingId,
      waterpark,
      waterparkName,
      paymentType,
      paymentMethod: paymentMethod || 'phonepe',
      name,
      email,
      phone,
      date: new Date(date),
      bookingDate: new Date(),
      adults: adults || 0,
      children: children || 0,
      waternumber: waternumber || '',
      advanceAmount,
      paymentStatus: mappedPaymentStatus,
      totalAmount: total,
      terms: terms || '',
      leftamount: total - advanceAmount
    });

    const savedBooking = await newBooking.save();

    // Save to bookings.json for admin
    await appendBookingToJson(savedBooking);

    // Send booking confirmation email (non-blocking)
    sendBookingConfirmationEmail(savedBooking);
    
    res.status(201).json({ 
      success: true, 
      message: 'Booking created successfully!', 
      booking: savedBooking
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ success: false, message: 'Failed to create booking.', error: error.message });
  }
};

// Get all bookings for a specific user by email
const getOrdersByEmail = async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }
    // Case-insensitive search for email
    const bookings = await Booking.find({ email: { $regex: new RegExp(`^${userEmail}$`, 'i') } }).sort({ bookingDate: -1 });
    res.status(200).json({ success: true, bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bookings.', error: error.message });
  }
};

// Get a single booking by its ID
const getOrderById = async (req, res) => {
  try {
    const booking = await Booking.findOne({ customBookingId: req.params.id });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    res.status(200).json({ success: true, booking });
  } catch (error) {
    console.error('Error fetching booking by ID:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch booking.', error: error.message });
  }
};

// Helper to append booking to bookings.json
async function appendBookingToJson(booking) {
  try {
    let bookings = [];
    try {
      const data = await fs.readFile(bookingsJsonPath, 'utf8');
      bookings = JSON.parse(data);
      if (!Array.isArray(bookings)) bookings = [];
    } catch (err) {
      // If file doesn't exist, start with empty array
      bookings = [];
    }
    bookings.push(booking.toObject ? booking.toObject({ virtuals: true }) : booking);
    await fs.writeFile(bookingsJsonPath, JSON.stringify(bookings, null, 2));
  } catch (err) {
    console.error('Failed to append booking to bookings.json:', err);
  }
}

// Helper to send booking confirmation email
async function sendBookingConfirmationEmail(booking) {
  const { email, name, waterparkName, date, adults, children, totalAmount, advanceAmount, leftamount } = booking;
  const subject = `Your ${waterparkName} Booking Confirmation`;

  const formattedDate = new Date(date).toLocaleDateString('en-IN', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">${waterparkName}</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Booking Confirmation</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${name}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            Thank you for your booking! Your booking has been confirmed. Here are your booking details:
          </p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <div style="margin-bottom: 10px;"><strong>Booking ID:</strong> ${booking.customBookingId}</div>
          <div style="margin-bottom: 10px;"><strong>Visit Date:</strong> ${formattedDate}</div>
          <div style="margin-bottom: 10px;"><strong>Adults:</strong> ${adults}</div>
          <div style="margin-bottom: 10px;"><strong>Children:</strong> ${children}</div>
          <div style="margin-bottom: 10px;"><strong>Advance Paid:</strong> ₹${advanceAmount}</div>
          ${leftamount > 0 ? `<div style="margin-bottom: 10px;"><strong>Remaining Amount:</strong> ₹${leftamount}</div>` : ''}
          <div><strong>Total Amount:</strong> ₹${totalAmount}</div>
        </div>
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            We look forward to seeing you at ${waterparkName}! Please bring a copy of this booking confirmation for entry.
          </p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.6;">
            <strong>Warm regards,</strong><br>
            Team Waterpark
          </p>
        </div>
      </div>
    </div>
  `;

  const textBody = `Dear ${name},\n\nThank you for your booking! Your booking has been confirmed.\n\nBooking ID: ${booking.customBookingId}\nVisit Date: ${formattedDate}\nAdults: ${adults}\nChildren: ${children}\nAdvance Paid: ₹${advanceAmount}\n${leftamount > 0 ? `Remaining Amount: ₹${leftamount}\n` : ''}Total Amount: ₹${totalAmount}\n\nWe look forward to seeing you at ${waterparkName}!\n\nWarm regards,\nTeam Waterpark`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`Booking confirmation email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending booking confirmation email:', mailErr);
    // Don't throw, so booking creation isn't blocked by email failure
  }
}

module.exports = {
  createOrder,
  getOrdersByEmail,
  getOrderById,
}; 