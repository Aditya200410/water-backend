// File: admin/backend/controllers/bookingController.js
const Booking = require("../models/Booking");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { sendWhatsAppMessage } = require("../service/whatsappService");
const {selfWhatsAppMessage }= require("../service/whatsappself");
const {parkWhatsAppMessage }= require("../service/whatsapppark")
const Counter = require("../models/Counter")
const { generateAndUploadTicket } = require("../services/ticketService");
const Ticket = require("../models/Ticket");

// ✅ 2. ADD THIS HELPER FUNCTION
// This function atomically finds and increments a counter in the database.
async function getNextSequenceValue(sequenceName) {
  const sequenceDocument = await Counter.findOneAndUpdate(
    { _id: sequenceName },
    // This is an aggregation pipeline. It's a modern way to perform complex atomic updates.
    [
      {
        // Step 1: Set the sequence_value. If it doesn't exist (on insert), default it to 399. Otherwise, keep its current value.
        $set: {
          sequence_value: {
            $ifNull: ["$sequence_value", 399] 
          }
        }
      },
      {
        // Step 2: Set the sequence_value again, this time adding 1 to the value from the previous step.
        $set: {
          sequence_value: {
            $add: ["$sequence_value", 1]
          }
        }
      }
    ],
    { new: true, upsert: true } // Return the new value and create the doc if it doesn't exist
  );
  return sequenceDocument.sequence_value;
}
// ----------------------------
// Razorpay Initialization
// ----------------------------
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  console.log("[Init] Initializing Razorpay with provided credentials...");
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  console.log("[Init] Razorpay initialized successfully.");
} else {
  console.warn(
    "[Init] Razorpay credentials missing. Online payments will fail until configured."
  );
}

// ----------------------------
// Email Helper
// ----------------------------
const sendEmail = async (to, subject, html, textFallback) => {
  console.log("[sendEmail] Preparing to send email:", { to, subject });

  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: Array.isArray(to) ? to.join(",") : to,
    subject,
    html,
    text: textFallback || html?.replace(/<[^>]*>?/gm, ""),
  };

  try {
    console.log("[sendEmail] Sending email with options:", mailOptions);
    
    // Add timeout to email sending
    const emailPromise = transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Email timeout')), 15000)
    );
    
    await Promise.race([emailPromise, timeoutPromise]);
    console.log("[sendEmail] Email sent successfully.");
  } catch (error) {
    console.error("[sendEmail] Error sending email:", error);
  }
};

// ----------------------------
// Utils
// ----------------------------
const toIntPaise = (amt) => {
  console.log("[toIntPaise] Converting to paise:", amt);
  const n = Number(amt);
  if (!Number.isFinite(n)) {
    console.warn("[toIntPaise] Invalid number:", amt);
    return null;
  }
  return Math.round(n * 100);
};

const safeDate = (value) => {
  console.log("[safeDate] Parsing date:", value);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};


// ----------------------------
// Create Booking (with Razorpay integration)
// ----------------------------
exports.createBooking = async (req, res) => {
  console.log("[createBooking] Request body:", req.body);

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
      terms
    } = req.body;

    // Validation
    const missing = [];
    if (!waterpark) missing.push("waterpark");
    if (!name) missing.push("name");
    if (!email) missing.push("email");
    if (!phone) missing.push("phone");
    if (!date) missing.push("date");
    if (advanceAmount === undefined || advanceAmount === null)
      missing.push("advanceAmount");
    if (!paymentType) missing.push("paymentType");
    if (!waterparkName) missing.push("waterparkName");
    if (total === undefined || total === null) missing.push("total");

    if (missing.length) {
      console.warn("[createBooking] Missing required fields:", missing);
      return res
        .status(400)
        .json({
          success: false,
          message: "Missing required fields",
          missing,
        });
    }

    const bookingDateObj = safeDate(date);
    if (!bookingDateObj) {
      console.warn("[createBooking] Invalid date format:", date);
      return res
        .status(400)
        .json({ success: false, message: "Invalid date format" });
    }

    const advancePaise = toIntPaise(advanceAmount);
    const totalAmount = Number(total);
    const calculatedLeftAmount = totalAmount - Number(advanceAmount);

    if (advancePaise === null || !Number.isFinite(totalAmount)) {
      console.warn("[createBooking] Invalid amounts:", { advanceAmount, total });
      return res
        .status(400)
        .json({ success: false, message: "Invalid amounts" });
    }

   // ✅ START: CORRECTED BOOKING ID GENERATION
console.log("[createBooking] Generating custom booking ID for:", waterparkName);

// ✅ 3. REPLACE YOUR OLD ID LOGIC WITH THIS
    // Sanitize park name to use as the counter's name
    const parkPrefix = "waterparkchalo";
    
    // Get the next unique number for this park from our atomic counter
    const bookingNumber = await getNextSequenceValue(parkPrefix);
    
    // Create the final, unique booking ID
    const customBookingId = `${parkPrefix}${bookingNumber}`;
    console.log("[createBooking] Generated Atomic Custom ID:", customBookingId);


    const bookingData = {
      customBookingId, // Add the generated ID to the booking data
      waterpark,
      waterparkName,
      name,
      waternumber,
      email,
      phone,
      date: bookingDateObj,
      adults: Number(adults) || 0,
      children: Number(children) || 0,
      advanceAmount: Number(advanceAmount),
      totalAmount,
      leftamount: calculatedLeftAmount,
      paymentStatus: paymentMethod === "cash" ? "Pending" : "Initiated",
      paymentType, // This is the product's payment type (advance/full)
      paymentMethod, // This is the payment method (razorpay/cash)
      bookingDate: new Date(),
      terms
    };

    if (req.user?.userId) {
      console.log(
        "[createBooking] Associating booking with user:",
        req.user.userId
      );
      bookingData.user = req.user.userId;
    }

    console.log("[createBooking] Booking data prepared:", bookingData);
    const booking = new Booking(bookingData);
    await booking.save();
    console.log("[createBooking] Booking saved with custom ID:", booking.customBookingId);

    if (paymentType === "cash") {
        console.log(
            "[createBooking] Cash payment flow, sending notifications in parallel."
        );
      
        
      
        // Send all notifications in parallel for faster response
        const notificationPromises = [
          selfWhatsAppMessage({
            id: booking.waterpark.toString(),
            waterparkName: booking.waterparkName,
            customBookingId: booking.customBookingId,
            customerName: booking.name,
            customerPhone: booking.phone,
            date: booking.date,
            adultquantity: booking.adults,
            childquantity: booking.children,
            totalAmount: booking.totalAmount,
            left: booking.leftamount,
          }).catch(err => console.error("[createBooking] Self WhatsApp error:", err.message)),

          parkWhatsAppMessage({
            id: booking.waterpark.toString(),
            waterparkName: booking.waterparkName,
            customBookingId: booking.customBookingId,
            customerName: booking.name,
            waternumber: booking.waternumber,
            customerPhone: booking.phone,
            date: booking.date,
            adultquantity: booking.adults,
            childquantity: booking.children,
            totalAmount: booking.totalAmount,
            left: booking.leftamount,
          }).catch(err => console.error("[createBooking] Park WhatsApp error:", err.message))
        ];

        // Don't wait for notifications to complete - respond immediately
        Promise.allSettled(notificationPromises).then(results => {
          console.log("[createBooking] All notifications completed:", results.map(r => r.status));
        });

        return res
            .status(201)
            .json({ success: true, message: "Booking created successfully", booking });
    }

    if (!razorpay) {
        console.error("[createBooking] Razorpay not configured.");
        console.error("[createBooking] RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID ? "Set" : "Not set");
        console.error("[createBooking] RAZORPAY_KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET ? "Set" : "Not set");
        return res
            .status(500)
            .json({
                success: false,
                message: "Payment gateway not configured",
                booking,
            });
    }

    const orderOptions = {
      amount: advancePaise,
      currency: "INR",
      receipt: booking._id.toString(), // Internal receipt still uses the unique _id
      payment_capture: 1,
      notes: {
        bookingId: booking._id.toString(),
        customBookingId: booking.customBookingId, // You can add the custom ID here for reference
        waterparkName,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        waternumber: waternumber,
      },
    };

    console.log(
      "[createBooking] Creating Razorpay order with options:",
      orderOptions
    );
    const order = await razorpay.orders.create(orderOptions);
    console.log("[createBooking] Razorpay order created:", order.id);

    return res.status(200).json({
      success: true,
      message: "Razorpay order created",
      orderId: order.id,
      booking,
      key: process.env.RAZORPAY_KEY_ID,
      amount: advancePaise,
      currency: "INR",
      name: "Waterpark Chalo",
      description: `Booking for ${waterparkName}`,
      prefill: { name, email, contact: phone },
    });
  } catch (error) {
    console.error("[createBooking] Error:", error);
    // Handle potential duplicate key error for customBookingId
    if (error.code === 11000) {
        return res.status(500).json({
            success: false,
            message: "Error creating booking: A booking ID conflict occurred. Please try again.",
            error: error.message,
        });
    }
    return res
      .status(500)
      .json({
        success: false,
        message: "Error creating booking.",
        error: error.message,
      });
  }
};


// ----------------------------
// Verify Payment
// ----------------------------
exports.verifyPayment = async (req, res) => {
  console.log("[verifyPayment] Request body:", req.body);

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId,
      redirect,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !bookingId
    ) {
      console.warn("[verifyPayment] Missing required fields.");
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    console.log("[verifyPayment] Generating signature for verification...");
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    console.log("[verifyPayment] Generated Signature:", generatedSignature);
    if (generatedSignature !== razorpay_signature) {
      console.warn("[verifyPayment] Signature mismatch.");
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment signature." });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      console.warn("[verifyPayment] Booking not found:", bookingId);
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    booking.paymentStatus = "Completed";
    booking.paymentType = "Razorpay";
    booking.paymentId = razorpay_payment_id;
    await booking.save();
    console.log(
      "[verifyPayment] Booking updated with payment success:",
      booking.customBookingId
    );

    // Generate and store ticket PDF asynchronously (don't block response)
    setImmediate(async () => {
      try {
        console.log("[verifyPayment] Starting ticket generation for booking:", booking.customBookingId);
        
        // Check if ticket already exists
        const existingTicket = await Ticket.findOne({ 
          $or: [
            { bookingId: booking._id },
            { customBookingId: booking.customBookingId }
          ]
        });
        
        if (existingTicket) {
          console.log("[verifyPayment] Ticket already exists for booking:", booking.customBookingId);
          return;
        }
        
        console.log("[verifyPayment] No existing ticket found, generating new one...");
        
        // Generate and upload ticket PDF
        console.log("[verifyPayment] Calling generateAndUploadTicket...");
        const ticketData = await generateAndUploadTicket(booking);
        console.log("[verifyPayment] Ticket data received:", {
          hasUrl: !!ticketData.ticketPdfUrl,
          hasPublicId: !!ticketData.cloudinaryPublicId,
          url: ticketData.ticketPdfUrl
        });
        
        // Create ticket record in database
        console.log("[verifyPayment] Creating ticket record...");
        const ticket = new Ticket({
          bookingId: booking._id,
          customBookingId: booking.customBookingId,
          ticketPdfUrl: ticketData.ticketPdfUrl,
          cloudinaryPublicId: ticketData.cloudinaryPublicId,
          status: "generated"
        });
        
        console.log("[verifyPayment] Saving ticket to database...");
        await ticket.save();
        console.log("[verifyPayment] Ticket generated and saved successfully:", {
          ticketId: ticket._id,
          customBookingId: ticket.customBookingId,
          pdfUrl: ticket.ticketPdfUrl
        });
        
      } catch (ticketError) {
        console.error("[verifyPayment] Error generating ticket:", ticketError);
        console.error("[verifyPayment] Error stack:", ticketError.stack);
        // Don't fail the payment verification if ticket generation fails
      }
    });

    // ✅ Use the readable customBookingId for the frontend URL
    const frontendUrl = `https://waterparkchalo.com/ticket?bookingId=${booking.customBookingId}`;
    console.log("[verifyPayment] Ticket URL:", frontendUrl);

    // ✅ Send all notifications in parallel for faster response
    console.log("[verifyPayment] Sending notifications in parallel...");
    
    const notificationPromises = [
      // WhatsApp messages
      sendWhatsAppMessage({
        id: booking.waterpark.toString(),
        waterparkName: booking.waterparkName,
        customBookingId: booking.customBookingId,
        customerName: booking.name,
        customerPhone: booking.phone,
        date: booking.date,
        adultquantity: booking.adults,
        childquantity: booking.children,
        totalAmount: booking.totalAmount,
        left: booking.leftamount,
      }).catch(err => console.error("[verifyPayment] Customer WhatsApp error:", err.message)),
      
      selfWhatsAppMessage({
        id: booking.waterpark.toString(),
        waterparkName: booking.waterparkName,
        customBookingId: booking.customBookingId,
        customerName: booking.name,
        customerPhone: booking.phone,
        date: booking.date,
        adultquantity: booking.adults,
        childquantity: booking.children,
        totalAmount: booking.totalAmount,
        left: booking.leftamount,
      }).catch(err => console.error("[verifyPayment] Self WhatsApp error:", err.message)),

      parkWhatsAppMessage({
        id: booking.waterpark.toString(),
        waterparkName: booking.waterparkName,
        customBookingId: booking.customBookingId,
        customerName: booking.name,
        waternumber: booking.waternumber,
        customerPhone: booking.phone,
        date: booking.date,
        adultquantity: booking.adults,
        childquantity: booking.children,
        totalAmount: booking.totalAmount,
        left: booking.leftamount,
      }).catch(err => console.error("[verifyPayment] Park WhatsApp error:", err.message)),

      // Email
      sendEmail(
        [booking.email, "am542062@gmail.com"],
        `Payment Confirmation for ${booking.waterparkName}`,
        `
        <html>
          <body style="font-family: Arial, sans-serif; background:#f9fafb; padding:20px; color:#333;">
            <div style="max-width:600px; margin:0 auto; background:white; border-radius:10px; padding:20px; border:1px solid #ddd;">
              
              <div style="text-align:center; margin-bottom:20px;">
                <h2 style="color:#1d4ed8; font-size:28px; margin:0;">${
                  booking.waterparkName
                }</h2>
                <p style="color:#555; font-style:italic;">"Splash • Chill • Fun"</p>
              </div>
      
              <table width="100%" style="border-top:1px dashed #60a5fa; padding-top:15px; font-size:14px;">
                <tr>
                  <td>
                    <p style="margin:0; color:#666; font-size:12px;">Booking ID</p>
                    <p style="margin:0; font-family:monospace; color:#1d4ed8; font-weight:bold;">${
                      booking.customBookingId
                    }</p>
                  </td>
                  <td style="text-align:right;">
                    <p style="margin:0; color:#666; font-size:12px;">Visit Date</p>
                    <p style="margin:0; font-weight:bold; color:#111;">
                      ${new Date(booking.date).toLocaleDateString()}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0; color:#666; font-size:12px;">Name</p>
                    <p style="margin:0; font-weight:600; color:#111;">${
                      booking.name
                    }</p>
                  </td>
                  <td style="text-align:right;">
                    <p style="margin:0; color:#666; font-size:12px;">Phone</p>
                    <p style="margin:0; font-weight:600; color:#111;">${
                      booking.phone
                    }</p>
                  </td>
                </tr>
              </table>
      
              <hr style="border:0; border-top:2px dotted #60a5fa; margin:20px 0;">
      
              <table width="100%" style="font-size:14px;">
                <tr>
                  <td>
                    <p style="margin:0; color:#666; font-size:12px;">Adults</p>
                    <p style="margin:0; font-weight:bold; color:#1d4ed8;">${
                      booking.adults
                    }</p>
                  </td>
                  <td style="text-align:right;">
                    <p style="margin:0; color:#666; font-size:12px;">Children</p>
                    <p style="margin:0; font-weight:bold; color:#db2777;">${
                      booking.children
                    }</p>
                  </td>
                </tr>
              </table>
      
              <table width="100%" style="border-top:1px dashed #60a5fa; padding-top:15px; font-size:14px; margin-top:15px;">
                <tr>
                  <td>
                    <p style="margin:0; color:#666; font-size:12px;">Advance Paid</p>
                    <p style="margin:0; font-weight:600; color:#16a34a;">₹${
                      booking.advanceAmount
                    }</p>
                  </td>
                  <td style="text-align:right;">
                    <p style="margin:0; color:#666; font-size:12px;">Total Amount</p>
                    <p style="margin:0; font-size:20px; font-weight:800; color:#be185d;">₹${
                      booking.totalAmount
                    }</p>
                  </td>
                    <td style="text-align:right;">
                    <p style="margin:0; color:#666; font-size:12px;">Left Amount</p>
                    <p style="margin:0; font-size:20px; font-weight:800; color:#be185d;">₹${
                      booking.leftamount
                    }</p>
                  </td>
                </tr>
              </table>
      
              <div style="text-align:center; margin-top:30px; font-size:13px; color:#666;">
                <p>Thank you for booking with <strong>${
                  booking.waterparkName
                }</strong>!</p>
                <p>We look forward to your visit.</p>
              </div>
            </div>
          </body>
        </html>
        `
      ).catch(err => console.error("[verifyPayment] Email error:", err.message))
    ];

    // Don't wait for notifications to complete - respond immediately
    Promise.allSettled(notificationPromises).then(results => {
      console.log("[verifyPayment] All notifications completed:", results.map(r => r.status));
    });

    const shouldRedirect =
      typeof redirect === "string"
        ? redirect.toLowerCase() === "true"
        : Boolean(redirect);
    if (shouldRedirect) {
      console.log("[verifyPayment] Redirecting to frontend URL.");
      return res.redirect(frontendUrl);
    }

    return res
      .status(200)
      .json({
        success: true,
        message: "Payment verified successfully",
        booking,
        frontendUrl,
      });
  } catch (error) {
    console.error("[verifyPayment] Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error verifying payment." });
  }
};


// --- The rest of your controller functions (getSingleBooking, getAllBookings, etc.) remain unchanged. ---
// --- I am including them here so you can copy-paste the whole file. ---

// ----------------------------
// Get Single Booking
// ----------------------------
exports.getSingleBooking = async (req, res) => {
  console.log("[getSingleBooking] Params:", req.params);

  try {
    const { customBookingId } = req.params;
     const booking = await Booking.findOne({ customBookingId: customBookingId , paymentStatus: "Completed" });
    if (!booking) {
      console.warn("[getSingleBooking] Booking not found:", customBookingId);
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }
    console.log("[getSingleBooking] Booking found:", booking.customBookingId);
    return res.status(200).json({ success: true, booking });
  } catch (error) {
    console.error("[getSingleBooking] Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching booking." });
  }
};

//get booking by email
// Get all orders for a specific user by email
exports.getOrdersByEmail = async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res
        .status(400)
        .json({ success: false, message: "Email query parameter is required." });
    }

    // Case-insensitive search for email in Booking collection
    const orders = await Booking.find({
      email: { $regex: new RegExp(`^${userEmail}$`, "i") },
    }).sort({ bookingDate: -1 });

    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch orders.",
        error: error.message,
      });
  }
};

// ----------------------------
// Get All Bookings
// ----------------------------
// ----------------------------
// Get All Bookings
// ----------------------------
exports.getAllBookings = async (req, res) => {
  console.log("[getAllBookings] Fetching all bookings...");
  try {
    // ✅ FIX: Changed findOne to find to get an array of all matching bookings
    const bookings = await Booking.find({ paymentStatus: "Completed"  });
    
    // Now bookings.length will correctly report the number of documents found
    console.log("[getAllBookings] Total bookings found:", bookings.length);
    return res.status(200).json(bookings);
  } catch (error) {
    console.error("[getAllBookings] Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ----------------------------
// Get User Bookings
// ----------------------------
exports.getUserBookings = async (req, res) => {
  console.log(
    "[getUserBookings] Request user:",
    req.user,
    "Request body:",
    req.body
  );

  try {
    let query = {};
    let role = "guest";

    if (req.user?.userId) {
      console.log("[getUserBookings] Fetching user from DB:", req.user.userId);
      const user = await User.findById(req.user.userId).select("email role");
      if (!user) {
        console.warn("[getUserBookings] User not found:", req.user.userId);
        return res
          .status(404)
          .json({ success: false, message: "User not found." });
      }
      query = { email: user.email };
      role = user.role || "user";
    } else if (req.body?.email) {
      query = { email: req.body.email };
      role = "guest";
    } else {
      console.warn("[getUserBookings] No email or auth provided.");
      return res
        .status(400)
        .json({ success: false, message: "Provide email or authenticate." });
    }

    console.log("[getUserBookings] Querying bookings with:", query);
    const bookings = await Booking.find(query).sort({ bookingDate: -1 });
    console.log("[getUserBookings] Bookings found:", bookings.length);

    if (!bookings.length) {
      return res
        .status(200)
        .json({ success: false, message: "No bookings found.", role });
    }

    return res.status(200).json({ success: true, role, bookings });
  } catch (error) {
    console.error("[getUserBookings] Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ----------------------------
// Test Razorpay Config
// ----------------------------
// ----------------------------
// Get Booking with Ticket Details for sharing
// ----------------------------
exports.getBookingWithTicket = async (req, res) => {
  console.log("[getBookingWithTicket] Params:", req.params);

  try {
    const { customBookingId } = req.params;
    
    // Find the booking with completed payment
    const booking = await Booking.findOne({ 
      customBookingId: customBookingId,
      paymentStatus: "Completed" 
    });
    
    if (!booking) {
      console.warn("[getBookingWithTicket] Booking not found or not completed:", customBookingId);
      return res
        .status(404)
        .json({ success: false, message: "Booking not found or payment not completed." });
    }

    // Find the associated ticket
    const ticket = await Ticket.findOne({ customBookingId: customBookingId });
    
    console.log("[getBookingWithTicket] Booking found:", booking.customBookingId);
    console.log("[getBookingWithTicket] Ticket found:", ticket ? ticket._id : "No ticket");

    // Return booking with ticket information
    return res.status(200).json({ 
      success: true, 
      booking,
      ticket: ticket ? {
        id: ticket._id,
        ticketPdfUrl: ticket.ticketPdfUrl,
        generatedAt: ticket.generatedAt,
        status: ticket.status,
        downloadCount: ticket.downloadCount
      } : null
    });
  } catch (error) {
    console.error("[getBookingWithTicket] Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching booking with ticket." });
  }
};

exports.testRazorpayConfig = async (req, res) => {
  console.log("[testRazorpayConfig] Testing Razorpay setup...");
  try {
    const config = {
      key_id: process.env.RAZORPAY_KEY_ID ? "Configured" : "Missing",
      key_secret: process.env.RAZORPAY_KEY_SECRET ? "Configured" : "Missing",
      razorpay_initialized: razorpay ? "Yes" : "No",
    };
    console.log("[testRazorpayConfig] Config:", config);

    if (!razorpay) {
      console.warn("[testRazorpayConfig] Razorpay not configured.");
      return res
        .status(500)
        .json({ success: false, message: "Razorpay not configured", config });
    }

    const testOrder = await razorpay.orders.create({
      amount: 100,
      currency: "INR",
      receipt: "test_receipt_" + Date.now(),
    });

    console.log("[testRazorpayConfig] Test order created:", testOrder.id);
    return res
      .status(200)
      .json({
        success: true,
        message: "Razorpay configured",
        config,
        test_order: testOrder.id,
      });
  } catch (error) {
    console.error("[testRazorpayConfig] Error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Razorpay test failed",
        error: error.message,
      });
  }
};