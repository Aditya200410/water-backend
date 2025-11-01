// File: admin/backend/controllers/bookingController.js
const Booking = require("../models/Booking");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const axios = require('axios');
const { sendWhatsAppMessage } = require("../service/whatsappService");
const {selfWhatsAppMessage }= require("../service/whatsappself");
const {parkWhatsAppMessage }= require("../service/whatsapppark")
const Counter = require("../models/Counter")

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
// PhonePe OAuth Token Cache
// ----------------------------
let oauthToken = null;
let tokenExpiry = null;

// Get OAuth token for PhonePe API
async function getPhonePeToken() {
  try {
    // Check if we have a valid cached token
    if (oauthToken && tokenExpiry && new Date() < tokenExpiry) {
      return oauthToken;
    }

    const clientId = process.env.PHONEPE_CLIENT_ID;
    const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
    const clientVersion = '1';      
    const env = process.env.PHONEPE_ENV || 'sandbox';

    if (!clientId || !clientSecret) {
      throw new Error('PhonePe OAuth credentials not configured');
    }

    // Set OAuth URL based on environment
    let oauthUrl;
    if (env === 'production') 
      oauthUrl = 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';
    else
      oauthUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';
    

    console.log('[getPhonePeToken] Getting PhonePe OAuth token from:', oauthUrl);

    const response = await axios.post(oauthUrl, 
      new URLSearchParams({
        client_id: clientId,
        client_version: clientVersion,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      }), 
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.access_token) {
      oauthToken = response.data.access_token;
      // Set expiry based on expires_at field from response
      if (response.data.expires_at) {
        tokenExpiry = new Date(response.data.expires_at * 1000); // Convert from seconds to milliseconds
      } else {
        // Fallback to 1 hour if expires_at is not provided
        tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
      }
      
      console.log('[getPhonePeToken] PhonePe OAuth token obtained successfully');
      console.log('[getPhonePeToken] Token expires at:', tokenExpiry);
      return oauthToken;
    } else {
      throw new Error('Invalid OAuth response from PhonePe');
    }
  } catch (error) {
    console.error('[getPhonePeToken] PhonePe OAuth token error:', error.response?.data || error.message);
    throw new Error('Failed to get PhonePe OAuth token');
  }
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
// Create Booking (with PhonePe integration)
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
      paymentStatus: "Pending", // All bookings start as "Pending" until payment completes
      paymentType, // This is the product's payment type (advance/full)
      paymentMethod, // This is the payment method (phonepe/cash)
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

    if (paymentMethod === "cash") {
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

    // ✅ PhonePe Payment Integration
    try {
      const accessToken = await getPhonePeToken();
      const env = process.env.PHONEPE_ENV || 'sandbox';
      const frontendUrl = process.env.FRONTEND_URL || 'https://www.waterparkchalo.com';
      const backendUrl = process.env.BACKEND_URL || 'https://water-backend.vercel.app';
      
      // Set base URL for payment API based on PhonePe documentation
      const baseUrl = env === 'production' 
        ? 'https://api.phonepe.com/apis/pg'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

      const apiEndpoint = '/checkout/v2/pay';
      const merchantOrderId = `MT${Date.now()}${Math.random().toString(36).substr(2, 6)}`;

      // Prepare payload according to PhonePe API documentation
      const payload = {
        merchantOrderId: merchantOrderId,
        amount: advancePaise, // Already in paise
        expireAfter: 1200, // 20 minutes expiry
        metaInfo: {
          udf1: name,
          udf2: email,
          udf3: phone,
          udf4: booking._id.toString(),
          udf5: booking.customBookingId,
          udf6: waterparkName,
          udf7: waternumber || '',
        },
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: `Booking payment for ${waterparkName}`,
          merchantUrls: {
            redirectUrl: `${backendUrl.replace(/\/+$/, '')}/api/bookings/phonepe/redirect?bookingId=${booking.customBookingId}&merchantOrderId=${merchantOrderId}`,
            callbackUrl: `${backendUrl.replace(/\/+$/, '')}/api/bookings/phonepe/callback`
          }
        }
      };

      console.log('[createBooking] Creating PhonePe order with payload:', {
        ...payload,
        amount: payload.amount,
        accessToken: '***HIDDEN***'
      });

      const response = await axios.post(
        baseUrl + apiEndpoint,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${accessToken}`
          },
          timeout: 30000
        }
      );

      console.log('[createBooking] PhonePe API response:', response.data);

      // Success response from PhonePe
      if (response.data && response.data.orderId && response.data.redirectUrl) {
        const orderId = response.data.orderId;
        const redirectUrl = response.data.redirectUrl;
        const state = response.data.state;

        // Save PhonePe order details to booking
        booking.phonepeOrderId = orderId;
        booking.phonepeMerchantOrderId = merchantOrderId;
        await booking.save();
        console.log('[createBooking] Saved PhonePe order details to booking:', { orderId, merchantOrderId });

        return res.status(200).json({
          success: true,
          message: "PhonePe order created",
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          redirectUrl: redirectUrl,
          state: state,
          booking,
        });
      } else {
        console.error('[createBooking] PhonePe payment initiation failed:', response.data);
        return res.status(500).json({
          success: false,
          message: response.data.message || 'PhonePe payment initiation failed',
          booking,
        });
      }
    } catch (error) {
      console.error('[createBooking] PhonePe order error:', error.response?.data || error.message);
      
      let errorMessage = 'Failed to create PhonePe order';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Payment gateway timeout. Please try again.';
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'Payment gateway not reachable. Please try again.';
      }
      
      return res.status(500).json({
        success: false,
        message: errorMessage,
        booking,
        error: error.response?.data || error.message
      });
    }
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
// Verify Payment (PhonePe)
// ----------------------------
exports.verifyPayment = async (req, res) => {
  console.log("[verifyPayment] Request body:", req.body);

  try {
    const {
      orderId,
      merchantOrderId,
      customBookingId,
    } = req.body;

    if (!orderId && !merchantOrderId && !customBookingId) {
      console.warn("[verifyPayment] Missing required fields.");
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields: orderId or merchantOrderId or customBookingId" });
    }

    // Find booking by customBookingId first, then by PhonePe order IDs
    let booking = null;
    if (customBookingId) {
      booking = await Booking.findOne({ customBookingId });
    } else if (merchantOrderId) {
      booking = await Booking.findOne({ phonepeMerchantOrderId: merchantOrderId });
    } else if (orderId) {
      booking = await Booking.findOne({ phonepeOrderId: orderId });
    }

    if (!booking) {
      console.warn("[verifyPayment] Booking not found:", { orderId, merchantOrderId, customBookingId });
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    // Verify payment status with PhonePe API
    try {
      const accessToken = await getPhonePeToken();
      const env = process.env.PHONEPE_ENV || 'sandbox';
      const baseUrl = env === 'production' 
        ? 'https://api.phonepe.com/apis/pg'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
      
      // Use orderId (PhonePe's transaction ID) for status check
      const phonepeOrderId = orderId || booking.phonepeOrderId;
      if (!phonepeOrderId) {
        throw new Error('PhonePe order ID not found');
      }

      const apiEndpoint = `/checkout/v2/order/${phonepeOrderId}/status`;
      console.log(`[verifyPayment] Checking PhonePe status for orderId: ${phonepeOrderId}`);
      
      const statusResponse = await axios.get(
        baseUrl + apiEndpoint,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${accessToken}`
          },
          timeout: 30000
        }
      );

      console.log('[verifyPayment] PhonePe verification response:', statusResponse.data);

      if (statusResponse.data && statusResponse.data.state === 'COMPLETED') {
        // Payment successful - update paymentStatus to "Completed" using atomic update
        // Check if already completed to avoid duplicate updates
        if (booking.paymentStatus === "Completed") {
          console.log("[verifyPayment] Booking already confirmed, skipping update");
        } else {
          // Update booking status atomically
          const updatedBooking = await Booking.findOneAndUpdate(
            { 
              _id: booking._id,
              paymentStatus: { $ne: "Completed" } // Only update if NOT already Completed
            },
            {
              $set: {
                paymentStatus: "Completed",
                paymentId: phonepeOrderId
              }
            },
            { 
              new: true, // Return updated document
              runValidators: true // Run model validators
            }
          );

          if (!updatedBooking) {
            console.log("[verifyPayment] Booking was already updated (race condition avoided)");
            // Reload booking to get current status
            booking = await Booking.findById(booking._id);
          } else {
            booking = updatedBooking;
            console.log(
              "[verifyPayment] ✅ Payment successful - Booking status set to 'Completed':",
              booking.customBookingId
            );
            console.log("[verifyPayment] Verified payment status:", booking.paymentStatus);
          }
        }
      } else if (statusResponse.data && statusResponse.data.state === 'FAILED') {
        // Payment failed - update paymentStatus to "Failed"
        if (booking.paymentStatus !== "Completed") {
          await Booking.findOneAndUpdate(
            { _id: booking._id },
            { $set: { paymentStatus: "Failed" } },
            { new: true }
          );
          console.log(`[verifyPayment] Updated booking ${booking.customBookingId} to Failed`);
        }
        return res.status(400).json({
          success: false,
          message: 'Payment failed',
          state: 'FAILED',
          errorCode: statusResponse.data?.errorCode,
          detailedErrorCode: statusResponse.data?.detailedErrorCode
        });
      } else {
        console.warn('[verifyPayment] Payment not completed yet:', statusResponse.data?.state);
        return res.status(400).json({
          success: false,
          message: `Payment status: ${statusResponse.data?.state || 'PENDING'}`,
          state: statusResponse.data?.state || 'PENDING'
        });
      }
    } catch (verifyError) {
      console.error('[verifyPayment] PhonePe verification error:', verifyError);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify payment with PhonePe',
        error: verifyError.message
      });
    }

    console.log("[verifyPayment] Payment verified successfully");

    // ✅ Use the readable customBookingId for the frontend URL
    const frontendUrl = `https://www.waterparkchalo.com/ticket?bookingId=${booking.customBookingId}`;
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
  `✅ Your Booking is Confirmed for ${booking.waterparkName}!`,
  `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Confirmation</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f4f4f7;
        font-family: Arial, sans-serif;
      }
      .container {
        max-width: 600px;
        margin: 20px auto;
        background-color: #ffffff;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #dee2e6;
      }
      .header {
        background-color: #007bff;
        color: #ffffff;
        padding: 30px 20px;
        text-align: center;
      }
      .header h1 {
        margin: 0;
        font-size: 28px;
        font-weight: bold;
      }
      .content {
        padding: 30px;
        color: #333333;
        line-height: 1.6;
      }
      .content h2 {
        color: #0056b3;
        font-size: 22px;
        margin-top: 0;
      }
      .details-table, .payment-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }
      .details-table td, .payment-table td {
        padding: 12px 0;
        font-size: 16px;
        border-bottom: 1px solid #eeeeee;
      }
      .details-table td:first-child {
        color: #555555;
      }
      .details-table td:last-child, .payment-table td:last-child {
        text-align: right;
        font-weight: bold;
      }
      .payment-table .total-due td {
        font-size: 20px;
        font-weight: bold;
        color: #d9534f; /* A color for 'due' amount */
      }
      .payment-table .paid td {
        color: #5cb85c; /* Green for 'paid' */
      }
      .cta-button {
        display: block;
        width: 200px;
        margin: 30px auto;
        padding: 15px 20px;
        background-color: #007bff;
        color: #ffffff;
        text-align: center;
        text-decoration: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: bold;
      }
      .footer {
        text-align: center;
        padding: 20px;
        font-size: 12px;
        color: #888888;
        background-color: #f8f9fa;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>${booking.waterparkName}</h1>
      </div>
      <div class="content">
        <h2>Your Booking is Confirmed!</h2>
        <p>Hello ${booking.name}, thank you for your booking! We are excited to welcome you for a day of fun and splashes. Please find your booking details below.</p>

        <table class="details-table">
          <tr>
            <td>Booking ID:</td>
            <td style="font-family: monospace;">${booking.customBookingId}</td>
          </tr>
          <tr>
            <td>Visit Date:</td>
            <td>${new Date(booking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
          </tr>
          <tr>
            <td>Guests:</td>
            <td>${booking.adults} Adult(s), ${booking.children} Child(ren)</td>
          </tr>
           <tr>
            <td>Phone:</td>
            <td>${booking.phone}</td>
          </tr>
        </table>

        <h2 style="margin-top: 30px;">Payment Summary</h2>
        <table class="payment-table">
          <tr>
            <td>Total Amount:</td>
            <td>₹${booking.totalAmount.toFixed(2)}</td>
          </tr>
          <tr class="paid">
            <td>Advance Paid:</td>
            <td>₹${booking.advanceAmount.toFixed(2)}</td>
          </tr>
          <tr class="total-due">
            <td>Amount Due at Park:</td>
            <td>₹${booking.leftamount.toFixed(2)}</td>
          </tr>
        </table>
        
        <a href="https://waterpark-frontend.vercel.app/booking/${booking.customBookingId}" class="cta-button" style="color: #ffffff;">View Your Ticket</a>
        
        <p style="text-align: center; color: #555;">Please show the ticket at the ticket counter upon your arrival.</p>
      </div>
      <div class="footer">
        <p>This is an automated email. Please do not reply.</p>
        <p>&copy; ${new Date().getFullYear()} ${booking.waterparkName}. All rights reserved.</p>
      </div>
    </div>
  </body>
  </html>
`
).catch(err => console.error("[sendEmail] Email error:", err.message))
    ];

    // Don't wait for notifications to complete - respond immediately
    Promise.allSettled(notificationPromises).then(results => {
      console.log("[verifyPayment] All notifications completed:", results.map(r => r.status));
    });

   

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
// PhonePe Callback Handler for Bookings
// ----------------------------
exports.phonePeCallback = async (req, res) => {
  try {
    const { merchantOrderId, orderId, amount, status, code, merchantId } = req.body;
    console.log('[phonePeCallback] PhonePe callback received for booking:', req.body);
    
    if (!merchantOrderId || !orderId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Invalid callback data: merchantOrderId, orderId, and status are required'
      });
    }

    // Find booking by merchantOrderId
    let booking = await Booking.findOne({ phonepeMerchantOrderId: merchantOrderId });
    
    if (!booking) {
      // Try to find by orderId as fallback
      booking = await Booking.findOne({ phonepeOrderId: orderId });
    }

    if (!booking) {
      console.warn('[phonePeCallback] Booking not found:', { merchantOrderId, orderId });
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    try {
      const accessToken = await getPhonePeToken();
      const env = process.env.PHONEPE_ENV || 'sandbox';
      const baseUrl = env === 'production' 
        ? 'https://api.phonepe.com/apis/pg'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
      
      // Use orderId (PhonePe's transaction ID) for status check
      const apiEndpoint = `/checkout/v2/order/${orderId}/status`;
      const response = await axios.get(
        baseUrl + apiEndpoint,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${accessToken}`
          },
          timeout: 30000
        }
      );

      console.log('[phonePeCallback] PhonePe verification response:', response.data);
      
      if (response.data && response.data.state === 'COMPLETED') {
        console.log(`[phonePeCallback] Payment completed for booking: ${booking.customBookingId}`);
        
        // Check if already completed to avoid duplicate updates
        if (booking.paymentStatus === "Completed") {
          console.log('[phonePeCallback] Booking already confirmed, skipping update');
          return res.json({
            success: true,
            message: 'Booking already confirmed',
            bookingId: booking.customBookingId,
            merchantOrderId: merchantOrderId,
            status: 'COMPLETED'
          });
        }

        // Update booking status atomically
        const updatedBooking = await Booking.findOneAndUpdate(
          { 
            _id: booking._id,
            paymentStatus: { $ne: "Completed" } // Only update if NOT already Completed
          },
          {
            $set: {
              paymentStatus: "Completed",
              paymentId: orderId
            }
          },
          { 
            new: true, // Return updated document
            runValidators: true // Run model validators
          }
        );

        if (!updatedBooking) {
          console.log('[phonePeCallback] Booking was already updated (race condition avoided)');
          return res.json({
            success: true,
            message: 'Booking already confirmed',
            bookingId: booking.customBookingId,
            merchantOrderId: merchantOrderId,
            status: 'COMPLETED'
          });
        }

        console.log('[phonePeCallback] ✅ BOOKING UPDATED SUCCESSFULLY!');
        console.log('  - Custom Booking ID:', updatedBooking.customBookingId);
        console.log('  - Payment Status:', updatedBooking.paymentStatus);
        console.log('  - Payment ID:', updatedBooking.paymentId);

        // Send notifications in background (non-blocking)
        (async () => {
          try {
            console.log('[phonePeCallback] Sending notifications in background...');
            
            const notificationPromises = [
              sendWhatsAppMessage({
                id: updatedBooking.waterpark.toString(),
                waterparkName: updatedBooking.waterparkName,
                customBookingId: updatedBooking.customBookingId,
                customerName: updatedBooking.name,
                customerPhone: updatedBooking.phone,
                date: updatedBooking.date,
                adultquantity: updatedBooking.adults,
                childquantity: updatedBooking.children,
                totalAmount: updatedBooking.totalAmount,
                left: updatedBooking.leftamount,
              }).catch(err => console.error('[phonePeCallback] Customer WhatsApp error:', err.message)),
              
              selfWhatsAppMessage({
                id: updatedBooking.waterpark.toString(),
                waterparkName: updatedBooking.waterparkName,
                customBookingId: updatedBooking.customBookingId,
                customerName: updatedBooking.name,
                customerPhone: updatedBooking.phone,
                date: updatedBooking.date,
                adultquantity: updatedBooking.adults,
                childquantity: updatedBooking.children,
                totalAmount: updatedBooking.totalAmount,
                left: updatedBooking.leftamount,
              }).catch(err => console.error('[phonePeCallback] Self WhatsApp error:', err.message)),

              parkWhatsAppMessage({
                id: updatedBooking.waterpark.toString(),
                waterparkName: updatedBooking.waterparkName,
                customBookingId: updatedBooking.customBookingId,
                customerName: updatedBooking.name,
                waternumber: updatedBooking.waternumber,
                customerPhone: updatedBooking.phone,
                date: updatedBooking.date,
                adultquantity: updatedBooking.adults,
                childquantity: updatedBooking.children,
                totalAmount: updatedBooking.totalAmount,
                left: updatedBooking.leftamount,
              }).catch(err => console.error('[phonePeCallback] Park WhatsApp error:', err.message)),

              sendEmail(
                [updatedBooking.email, "am542062@gmail.com"],
                `✅ Your Booking is Confirmed for ${updatedBooking.waterparkName}!`,
                `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f4f7; font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #dee2e6; }
    .header { background-color: #007bff; color: #ffffff; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
    .content { padding: 30px; color: #333333; line-height: 1.6; }
    .content h2 { color: #0056b3; font-size: 22px; margin-top: 0; }
    .details-table, .payment-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .details-table td, .payment-table td { padding: 12px 0; font-size: 16px; border-bottom: 1px solid #eeeeee; }
    .details-table td:first-child { color: #555555; }
    .details-table td:last-child, .payment-table td:last-child { text-align: right; font-weight: bold; }
    .payment-table .total-due td { font-size: 20px; font-weight: bold; color: #d9534f; }
    .payment-table .paid td { color: #5cb85c; }
    .cta-button { display: block; width: 200px; margin: 30px auto; padding: 15px 20px; background-color: #007bff; color: #ffffff; text-align: center; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #888888; background-color: #f8f9fa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${updatedBooking.waterparkName}</h1></div>
    <div class="content">
      <h2>Your Booking is Confirmed!</h2>
      <p>Hello ${updatedBooking.name}, thank you for your booking! We are excited to welcome you for a day of fun and splashes. Please find your booking details below.</p>
      <table class="details-table">
        <tr><td>Booking ID:</td><td style="font-family: monospace;">${updatedBooking.customBookingId}</td></tr>
        <tr><td>Visit Date:</td><td>${new Date(updatedBooking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
        <tr><td>Guests:</td><td>${updatedBooking.adults} Adult(s), ${updatedBooking.children} Child(ren)</td></tr>
        <tr><td>Phone:</td><td>${updatedBooking.phone}</td></tr>
      </table>
      <h2 style="margin-top: 30px;">Payment Summary</h2>
      <table class="payment-table">
        <tr><td>Total Amount:</td><td>₹${updatedBooking.totalAmount.toFixed(2)}</td></tr>
        <tr class="paid"><td>Advance Paid:</td><td>₹${updatedBooking.advanceAmount.toFixed(2)}</td></tr>
        <tr class="total-due"><td>Amount Due at Park:</td><td>₹${updatedBooking.leftamount.toFixed(2)}</td></tr>
      </table>
      <a href="https://waterpark-frontend.vercel.app/booking/${updatedBooking.customBookingId}" class="cta-button" style="color: #ffffff;">View Your Ticket</a>
      <p style="text-align: center; color: #555;">Please show the ticket at the ticket counter upon your arrival.</p>
    </div>
    <div class="footer">
      <p>This is an automated email. Please do not reply.</p>
      <p>&copy; ${new Date().getFullYear()} ${updatedBooking.waterparkName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`
              ).catch(err => console.error('[phonePeCallback] Email error:', err.message))
            ];

            await Promise.allSettled(notificationPromises);
            console.log('[phonePeCallback] ✅ All notifications completed');
          } catch (err) {
            console.error('[phonePeCallback] Notification batch error:', err);
          }
        })();

        return res.json({
          success: true,
          message: 'Payment completed successfully',
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          bookingId: updatedBooking.customBookingId,
          status: 'COMPLETED'
        });
      } else if (response.data && response.data.state === 'FAILED') {
        console.log(`[phonePeCallback] Payment failed for booking: ${booking.customBookingId}`);
        
        // Update booking status to Failed if not already Completed
        if (booking.paymentStatus !== "Completed") {
          await Booking.findOneAndUpdate(
            { _id: booking._id },
            { $set: { paymentStatus: "Failed" } },
            { new: true }
          );
          console.log(`[phonePeCallback] Updated booking ${booking.customBookingId} to Failed`);
        }
        
        return res.json({
          success: false,
          message: 'Payment failed',
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          bookingId: booking.customBookingId,
          status: 'FAILED',
          errorCode: response.data.errorCode,
          detailedErrorCode: response.data.detailedErrorCode
        });
      } else {
        console.log(`[phonePeCallback] Payment pending for booking: ${booking.customBookingId}`);
        return res.json({
          success: true,
          message: 'Payment is pending',
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          status: 'PENDING'
        });
      }
    } catch (verificationError) {
      console.error('[phonePeCallback] PhonePe verification error:', verificationError);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify payment with PhonePe'
      });
    }
  } catch (error) {
    console.error('[phonePeCallback] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process callback'
    });
  }
};

// ----------------------------
// PhonePe Redirect Handler (checks status and redirects to ticket)
// ----------------------------
exports.phonePeRedirect = async (req, res) => {
  try {
    const { bookingId, merchantOrderId, orderId } = req.query;
    console.log('[phonePeRedirect] PhonePe redirect received:', { bookingId, merchantOrderId, orderId });

    if (!bookingId && !merchantOrderId && !orderId) {
      return res.status(400).send('Missing booking ID parameters');
    }

    // Find booking by customBookingId, merchantOrderId, or orderId
    let booking = null;
    if (bookingId) {
      booking = await Booking.findOne({ customBookingId: bookingId });
    } else if (merchantOrderId) {
      booking = await Booking.findOne({ phonepeMerchantOrderId: merchantOrderId });
    } else if (orderId) {
      booking = await Booking.findOne({ phonepeOrderId: orderId });
    }

    if (!booking) {
      console.warn('[phonePeRedirect] Booking not found:', { bookingId, merchantOrderId, orderId });
      // Redirect to error page or ticket page with error message
      const frontendUrl = process.env.FRONTEND_URL || 'https://www.waterparkchalo.com';
      return res.redirect(`${frontendUrl}/ticket?bookingId=${bookingId || ''}&error=notfound`);
    }

    // ALWAYS check payment status with PhonePe API and update if successful
    console.log('[phonePeRedirect] Current booking status:', booking.paymentStatus);
    console.log('[phonePeRedirect] PhonePe order IDs:', { orderId, phonepeOrderId: booking.phonepeOrderId });
    
    // Track the actual PhonePe payment state for proper redirect
    let phonepePaymentState = null;
    
    try {
      const accessToken = await getPhonePeToken();
      const env = process.env.PHONEPE_ENV || 'sandbox';
      const baseUrl = env === 'production' 
        ? 'https://api.phonepe.com/apis/pg'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
      
      const phonepeOrderId = orderId || booking.phonepeOrderId;
      if (phonepeOrderId) {
        const apiEndpoint = `/checkout/v2/order/${phonepeOrderId}/status`;
        console.log(`[phonePeRedirect] Checking PhonePe status for orderId: ${phonepeOrderId}`);
        
        const statusResponse = await axios.get(
          baseUrl + apiEndpoint,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `O-Bearer ${accessToken}`
            },
            timeout: 30000
          }
        );

        console.log('[phonePeRedirect] PhonePe verification response:', statusResponse.data);
        console.log('[phonePeRedirect] Payment state:', statusResponse.data?.state);

        // Track the PhonePe payment state
        phonepePaymentState = statusResponse.data?.state;

        // If payment is COMPLETED, set paymentStatus to "Completed" (same as Razorpay)
        if (statusResponse.data && statusResponse.data.state === 'COMPLETED') {
          console.log('[phonePeRedirect] Payment is COMPLETED - Updating booking status...');
          
          // Use findOneAndUpdate for atomic update (same as Razorpay webhook pattern)
          const updatedBooking = await Booking.findOneAndUpdate(
            { 
              _id: booking._id,
              paymentStatus: { $ne: "Completed" } // Only update if NOT already Completed
            },
            {
              $set: {
                paymentStatus: "Completed",
                paymentId: phonepeOrderId
              }
            },
            { 
              new: true, // Return updated document
              runValidators: true // Run model validators
            }
          );

          if (updatedBooking) {
            booking = updatedBooking; // Use the updated booking
            console.log('[phonePeRedirect] ✅ Payment successful - Booking status updated to "Completed" (same as Razorpay):', booking.customBookingId);
            console.log('[phonePeRedirect] Verified booking status:', booking.paymentStatus);
          } else {
            // Booking might already be completed (race condition)
            booking = await Booking.findById(booking._id); // Reload to get current status
            console.log('[phonePeRedirect] Booking was already updated or status unchanged:', booking.paymentStatus);
            
            // Force update if status is still not Completed
            if (booking.paymentStatus !== "Completed") {
              booking.paymentStatus = "Completed";
              booking.paymentId = phonepeOrderId;
              await booking.save();
              console.log('[phonePeRedirect] ✅ Force updated booking status to "Completed"');
            }
          }

          // Send notifications in background (non-blocking) only if payment was completed
          (async () => {
              try {
                const notificationPromises = [
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
                  }).catch(err => console.error('[phonePeRedirect] Customer WhatsApp error:', err.message)),
                  
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
                  }).catch(err => console.error('[phonePeRedirect] Self WhatsApp error:', err.message)),

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
                  }).catch(err => console.error('[phonePeRedirect] Park WhatsApp error:', err.message)),

                  sendEmail(
                    [booking.email, "am542062@gmail.com"],
                    `✅ Your Booking is Confirmed for ${booking.waterparkName}!`,
                    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f4f7; font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #dee2e6; }
    .header { background-color: #007bff; color: #ffffff; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
    .content { padding: 30px; color: #333333; line-height: 1.6; }
    .content h2 { color: #0056b3; font-size: 22px; margin-top: 0; }
    .details-table, .payment-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .details-table td, .payment-table td { padding: 12px 0; font-size: 16px; border-bottom: 1px solid #eeeeee; }
    .details-table td:first-child { color: #555555; }
    .details-table td:last-child, .payment-table td:last-child { text-align: right; font-weight: bold; }
    .payment-table .total-due td { font-size: 20px; font-weight: bold; color: #d9534f; }
    .payment-table .paid td { color: #5cb85c; }
    .cta-button { display: block; width: 200px; margin: 30px auto; padding: 15px 20px; background-color: #007bff; color: #ffffff; text-align: center; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #888888; background-color: #f8f9fa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${booking.waterparkName}</h1></div>
    <div class="content">
      <h2>Your Booking is Confirmed!</h2>
      <p>Hello ${booking.name}, thank you for your booking! We are excited to welcome you for a day of fun and splashes. Please find your booking details below.</p>
      <table class="details-table">
        <tr><td>Booking ID:</td><td style="font-family: monospace;">${booking.customBookingId}</td></tr>
        <tr><td>Visit Date:</td><td>${new Date(booking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
        <tr><td>Guests:</td><td>${booking.adults} Adult(s), ${booking.children} Child(ren)</td></tr>
        <tr><td>Phone:</td><td>${booking.phone}</td></tr>
      </table>
      <h2 style="margin-top: 30px;">Payment Summary</h2>
      <table class="payment-table">
        <tr><td>Total Amount:</td><td>₹${booking.totalAmount.toFixed(2)}</td></tr>
        <tr class="paid"><td>Advance Paid:</td><td>₹${booking.advanceAmount.toFixed(2)}</td></tr>
        <tr class="total-due"><td>Amount Due at Park:</td><td>₹${booking.leftamount.toFixed(2)}</td></tr>
      </table>
      <a href="https://waterpark-frontend.vercel.app/booking/${booking.customBookingId}" class="cta-button" style="color: #ffffff;">View Your Ticket</a>
      <p style="text-align: center; color: #555;">Please show the ticket at the ticket counter upon your arrival.</p>
    </div>
    <div class="footer">
      <p>This is an automated email. Please do not reply.</p>
      <p>&copy; ${new Date().getFullYear()} ${booking.waterparkName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`
                  ).catch(err => console.error('[phonePeRedirect] Email error:', err.message))
                ];

                await Promise.allSettled(notificationPromises);
                console.log('[phonePeRedirect] ✅ All notifications completed');
              } catch (err) {
                console.error('[phonePeRedirect] Notification batch error:', err);
              }
            })();
        } else if (statusResponse.data && statusResponse.data.state === 'FAILED') {
          console.log('[phonePeRedirect] Payment FAILED for booking:', booking.customBookingId);
          
          // Update booking status to Failed if not already Completed
          if (booking.paymentStatus !== "Completed") {
            await Booking.findOneAndUpdate(
              { _id: booking._id },
              { $set: { paymentStatus: "Failed" } },
              { new: true }
            );
            console.log(`[phonePeRedirect] Updated booking ${booking.customBookingId} to Failed`);
          }
        } else {
          console.log('[phonePeRedirect] Payment state is not COMPLETED:', statusResponse.data?.state);
        }
      } else {
        console.log('[phonePeRedirect] No phonepeOrderId available for status check');
      }
    } catch (verifyError) {
      console.error('[phonePeRedirect] PhonePe verification error:', verifyError);
      // Even if verification fails, check if payment might be completed
      // Try to verify using the booking's phonepeOrderId one more time
      try {
        if (booking.phonepeOrderId) {
          const accessToken = await getPhonePeToken();
          const env = process.env.PHONEPE_ENV || 'sandbox';
          const baseUrl = env === 'production' 
            ? 'https://api.phonepe.com/apis/pg'
            : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
          
          const apiEndpoint = `/checkout/v2/order/${booking.phonepeOrderId}/status`;
          const retryResponse = await axios.get(
            baseUrl + apiEndpoint,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `O-Bearer ${accessToken}`
              },
              timeout: 10000
            }
          );
          
          // Track retry state as well
          if (retryResponse.data && retryResponse.data.state) {
            phonepePaymentState = retryResponse.data.state;
          }
          
          if (retryResponse.data && retryResponse.data.state === 'COMPLETED') {
            console.log('[phonePeRedirect] Retry verification found COMPLETED payment - Updating status...');
            
            // Use findOneAndUpdate for atomic update
            const retryUpdatedBooking = await Booking.findOneAndUpdate(
              { 
                _id: booking._id,
                paymentStatus: { $ne: "Completed" }
              },
              {
                $set: {
                  paymentStatus: "Completed",
                  paymentId: booking.phonepeOrderId
                }
              },
              { 
                new: true,
                runValidators: true
              }
            );
            
            if (retryUpdatedBooking) {
              booking = retryUpdatedBooking;
              console.log('[phonePeRedirect] ✅ Payment verified on retry - Status set to "Completed":', booking.customBookingId);
              console.log('[phonePeRedirect] Final booking status:', booking.paymentStatus);
            } else {
              // Reload and check
              booking = await Booking.findById(booking._id);
              if (booking.paymentStatus !== "Completed") {
                booking.paymentStatus = "Completed";
                booking.paymentId = booking.phonepeOrderId;
                await booking.save();
                console.log('[phonePeRedirect] ✅ Force updated status to "Completed" on retry');
              }
            }
          }
        }
      } catch (retryError) {
        console.error('[phonePeRedirect] Retry verification also failed:', retryError.message);
      }
      // Continue anyway - booking exists, redirect to ticket page
      // The ticket page will use "any" status endpoint to fetch the booking regardless of payment status
    }

    // Ensure booking exists before redirecting
    if (!booking) {
      console.error('[phonePeRedirect] No booking found to redirect');
      const frontendUrl = process.env.FRONTEND_URL || 'https://www.waterparkchalo.com';
      return res.redirect(`${frontendUrl}/ticket?error=bookingnotfound`);
    }

    // CRITICAL: If payment was successful but status is still not "Completed", force update it
    if (booking.phonepeOrderId && booking.paymentStatus !== "Completed") {
      console.log('[phonePeRedirect] ⚠️ WARNING: Payment ID exists but status is not "Completed" - Attempting final update...');
      
      // Try one more time to check payment status and update
      try {
        const accessToken = await getPhonePeToken();
        const env = process.env.PHONEPE_ENV || 'sandbox';
        const baseUrl = env === 'production' 
          ? 'https://api.phonepe.com/apis/pg'
          : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
        
        const finalCheckResponse = await axios.get(
          `${baseUrl}/checkout/v2/order/${booking.phonepeOrderId}/status`,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `O-Bearer ${accessToken}`
            },
            timeout: 10000
          }
        );
        
        // Track final check state as well
        if (finalCheckResponse.data && finalCheckResponse.data.state) {
          phonepePaymentState = finalCheckResponse.data.state;
        }
        
        if (finalCheckResponse.data && finalCheckResponse.data.state === 'COMPLETED') {
          console.log('[phonePeRedirect] Final check found COMPLETED payment - Updating status...');
          const finalUpdate = await Booking.findOneAndUpdate(
            { _id: booking._id },
            {
              $set: {
                paymentStatus: "Completed",
                paymentId: booking.phonepeOrderId
              }
            },
            { new: true }
          );
          
          if (finalUpdate) {
            booking = finalUpdate;
            console.log('[phonePeRedirect] ✅ Final update successful - Status set to "Completed"');
          } else {
            // Fallback to direct save if findOneAndUpdate didn't work
            booking.paymentStatus = "Completed";
            booking.paymentId = booking.phonepeOrderId;
            await booking.save();
            booking = await Booking.findById(booking._id);
            console.log('[phonePeRedirect] ✅ Final update via save - Status set to "Completed"');
          }
        }
      } catch (finalError) {
        console.error('[phonePeRedirect] Final check failed, proceeding anyway:', finalError.message);
      }
    }

    // Redirect based on payment status
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.waterparkchalo.com';
    
    // Final reload of booking to ensure we have latest status
    booking = await Booking.findById(booking._id);
    console.log('[phonePeRedirect] Final booking status before redirect:', booking.paymentStatus);
    console.log('[phonePeRedirect] Final booking details:', {
      customBookingId: booking.customBookingId,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      paymentId: booking.paymentId
    });
    console.log('[phonePeRedirect] PhonePe payment state from API:', phonepePaymentState);
    
    if (booking.paymentStatus === "Completed" || phonepePaymentState === 'COMPLETED') {
      // Payment successful - redirect to ticket page
      const ticketUrl = `${frontendUrl}/ticket?bookingId=${booking.customBookingId}`;
      console.log('[phonePeRedirect] ✅ Payment completed - Redirecting to ticket page:', ticketUrl);
      return res.redirect(ticketUrl);
    } else if (phonepePaymentState === 'FAILED') {
      // Payment failed - redirect to payment failure page
      const failureUrl = `${frontendUrl}/payment/status?bookingId=${booking.customBookingId}&status=failed`;
      console.log('[phonePeRedirect] ❌ Payment failed - Redirecting to failure page:', failureUrl);
      return res.redirect(failureUrl);
    } else {
      // Payment pending or unknown - redirect to payment status page with pending
      const pendingUrl = `${frontendUrl}/payment/status?bookingId=${booking.customBookingId}&status=pending`;
      console.log('[phonePeRedirect] ⏳ Payment pending - Redirecting to payment status page:', pendingUrl);
      return res.redirect(pendingUrl);
    }
  } catch (error) {
    console.error('[phonePeRedirect] Error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.waterparkchalo.com';
    return res.redirect(`${frontendUrl}/ticket?error=redirectfailed`);
  }
};

// ----------------------------
// Get Single Booking (Any status - for verification)
// ----------------------------
exports.getSingleBookingAnyStatus = async (req, res) => {
  console.log("[getSingleBookingAnyStatus] Params:", req.params);

  try {
    const { customBookingId } = req.params;
    const booking = await Booking.findOne({ customBookingId: customBookingId });
    if (!booking) {
      console.warn("[getSingleBookingAnyStatus] Booking not found:", customBookingId);
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }
    console.log("[getSingleBookingAnyStatus] Booking found:", booking.customBookingId, "Status:", booking.paymentStatus);
    return res.status(200).json({ success: true, booking });
  } catch (error) {
    console.error("[getSingleBookingAnyStatus] Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching booking." });
  }
};

// ----------------------------
// Get Single Booking (Completed only)
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

// ----------------------------
// Get Booking Status (Any status)
// ----------------------------
exports.getBookingStatus = async (req, res) => {
  console.log("\n[getBookingStatus] 🔍 Status check requested");
  console.log("[getBookingStatus] Params:", req.params);
  console.log("[getBookingStatus] Timestamp:", new Date().toISOString());

  try {
    const { customBookingId } = req.params;
    console.log("[getBookingStatus] Looking up booking with customBookingId:", customBookingId);
    
    const booking = await Booking.findOne({ customBookingId: customBookingId });
    
    if (!booking) {
      console.warn("[getBookingStatus] ❌ Booking not found for customBookingId:", customBookingId);
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }
    
    console.log("[getBookingStatus] ✅ Booking found!");
    console.log("  - Custom Booking ID:", booking.customBookingId);
    console.log("  - Payment Status:", booking.paymentStatus);
    console.log("  - Payment ID:", booking.paymentId || "N/A");
    console.log("  - Booking Date:", booking.bookingDate);
    console.log("  - Database _id:", booking._id);
    
    return res.status(200).json({ 
      success: true, 
      booking
    });
  } catch (error) {
    console.error("[getBookingStatus] ❌ Error:", error.message);
    console.error("[getBookingStatus] Stack:", error.stack);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching booking status." });
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

// Get bookings by email OR phone number
exports.getBookingsByEmailOrPhone = async (req, res) => {
  try {
    const { email, phone } = req.query;
    
    if (!email && !phone) {
      return res
        .status(400)
        .json({ 
          success: false, 
          message: "Either email or phone query parameter is required." 
        });
    }

    // Build query to search by email OR phone
    const query = {
      $or: []
    };

    if (email) {
      query.$or.push({
        email: { $regex: new RegExp(`^${email}$`, "i") }
      });
    }

    if (phone) {
      query.$or.push({
        phone: { $regex: new RegExp(`^${phone}$`, "i") }
      });
    }

    // Only fetch completed bookings
    query.paymentStatus = "Completed";

    const bookings = await Booking.find(query).sort({ bookingDate: -1 });

    res.status(200).json({ 
      success: true, 
      bookings,
      count: bookings.length 
    });
  } catch (error) {
    console.error("Error fetching bookings by email or phone:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch bookings.",
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

    console.log("[getBookingWithTicket] Booking found:", booking.customBookingId);

    // Return booking without ticket information (tickets generated on-demand)
    return res.status(200).json({ 
      success: true, 
      booking,
      ticket: null // No ticket storage - generated on-demand
    });
  } catch (error) {
    console.error("[getBookingWithTicket] Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching booking with ticket." });
  }
};

// ----------------------------
// Razorpay Webhook Handler
// ----------------------------

exports.razorpayWebhook = async (req, res) => {
  const startTime = Date.now();
  console.log("\n" + "=".repeat(80));
  console.log("[razorpayWebhook] 🔔 WEBHOOK RECEIVED:", new Date().toISOString());
  console.log("=".repeat(80));

  try {
    // ✅ Step 1: Parse raw body
    console.log("[razorpayWebhook] Step 1: Parsing raw body...");
    const rawBody = req.body.toString("utf8");
    console.log("[razorpayWebhook] Raw body length:", rawBody.length, "bytes");
    
    const webhookData = JSON.parse(rawBody);
    const { event, payload } = webhookData;
    
    console.log("[razorpayWebhook] ✅ Parsed webhook data successfully");
    console.log("[razorpayWebhook] Event type:", event);
    console.log("[razorpayWebhook] Payload keys:", Object.keys(payload || {}));

    // ✅ Step 2: Verify webhook secret exists
    console.log("\n[razorpayWebhook] Step 2: Verifying webhook secret...");
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[razorpayWebhook] ❌ CRITICAL: Webhook secret not configured in environment!");
      return res.status(500).json({ success: false, message: "Webhook secret missing" });
    }
    console.log("[razorpayWebhook] ✅ Webhook secret is configured");

    // ✅ Step 3: Verify signature
    console.log("\n[razorpayWebhook] Step 3: Verifying signature...");
    const receivedSignature = req.headers["x-razorpay-signature"];
    if (!receivedSignature) {
      console.error("[razorpayWebhook] ❌ No signature provided in headers");
      console.log("[razorpayWebhook] Available headers:", Object.keys(req.headers));
      return res.status(400).json({ success: false, message: "No signature provided" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    console.log("[razorpayWebhook] Received signature:", receivedSignature.substring(0, 20) + "...");
    console.log("[razorpayWebhook] Expected signature:", expectedSignature.substring(0, 20) + "...");

    if (receivedSignature !== expectedSignature) {
      console.error("[razorpayWebhook] ❌ SIGNATURE MISMATCH! Invalid webhook signature");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }
    console.log("[razorpayWebhook] ✅ Signature verified successfully");

    // ✅ Step 4: Handle payment.captured event
    if (event === "payment.captured") {
      console.log("\n[razorpayWebhook] Step 4: Processing payment.captured event");

      // Validate payload structure
      if (!payload?.payment?.entity) {
        console.error("[razorpayWebhook] ❌ Invalid payload structure - missing payment.entity");
        console.log("[razorpayWebhook] Payload structure:", JSON.stringify(payload, null, 2));
        return res.status(400).json({ success: false, message: "Invalid payload structure" });
      }

      const paymentEntity = payload.payment.entity;
      const orderEntity = payload.order?.entity;

      if (!orderEntity) {
        console.error("[razorpayWebhook] ❌ Order entity missing in payload");
        return res.status(400).json({ success: false, message: "Order entity missing" });
      }

      console.log("[razorpayWebhook] 💰 Payment Details:");
      console.log("  - Payment ID:", paymentEntity.id);
      console.log("  - Order ID:", orderEntity.id);
      console.log("  - Amount:", paymentEntity.amount / 100, "INR");
      console.log("  - Status:", paymentEntity.status);
      console.log("  - Method:", paymentEntity.method);
      console.log("  - Receipt (Booking _id):", orderEntity.receipt);

      // ✅ Step 5: Find booking using multiple strategies
      console.log("\n[razorpayWebhook] Step 5: Finding booking...");
      console.log("[razorpayWebhook] 🔍 DIAGNOSTIC - What Razorpay sent:");
      console.log("  📝 Receipt:", orderEntity.receipt);
      console.log("  📝 Receipt Type:", typeof orderEntity.receipt);
      console.log("  📝 Receipt Length:", orderEntity.receipt?.length);
      console.log("  📝 Is Valid ObjectId?:", /^[0-9a-fA-F]{24}$/.test(orderEntity.receipt));
      console.log("  📝 Order ID:", orderEntity.id);
      console.log("[razorpayWebhook] 🔍 DIAGNOSTIC - Payment Notes:");
      console.log(JSON.stringify(paymentEntity.notes, null, 2));
      
      let existingBooking = null;
      let searchMethod = "";
      
      // Strategy 1: Try to find by receipt (_id)
      if (orderEntity.receipt) {
        console.log("[razorpayWebhook] Strategy 1: Trying to find by receipt (_id):", orderEntity.receipt);
        try {
          existingBooking = await Booking.findById(orderEntity.receipt);
          if (existingBooking) {
            searchMethod = "receipt (_id)";
            console.log("[razorpayWebhook] ✅ Found booking by receipt!");
          }
        } catch (error) {
          console.log("[razorpayWebhook] Receipt is not a valid ObjectId, trying other methods...");
        }
      }
      
      // Strategy 2: Try to find by customBookingId from notes
      if (!existingBooking && paymentEntity.notes?.customBookingId) {
        console.log("[razorpayWebhook] Strategy 2: Trying to find by customBookingId from notes:", paymentEntity.notes.customBookingId);
        existingBooking = await Booking.findOne({ customBookingId: paymentEntity.notes.customBookingId });
        if (existingBooking) {
          searchMethod = "customBookingId from notes";
          console.log("[razorpayWebhook] ✅ Found booking by customBookingId!");
        }
      }
      
      // Strategy 3: Try to find by bookingId from notes
      if (!existingBooking && paymentEntity.notes?.bookingId) {
        console.log("[razorpayWebhook] Strategy 3: Trying to find by bookingId from notes:", paymentEntity.notes.bookingId);
        try {
          existingBooking = await Booking.findById(paymentEntity.notes.bookingId);
          if (existingBooking) {
            searchMethod = "bookingId from notes";
            console.log("[razorpayWebhook] ✅ Found booking by bookingId from notes!");
          }
        } catch (error) {
          console.log("[razorpayWebhook] bookingId from notes is not a valid ObjectId");
        }
      }
      
      // Strategy 4: Try to find by order_id
      if (!existingBooking) {
        console.log("[razorpayWebhook] Strategy 4: Trying to find by Razorpay order_id:", orderEntity.id);
        existingBooking = await Booking.findOne({ razorpayOrderId: orderEntity.id });
        if (existingBooking) {
          searchMethod = "razorpayOrderId";
          console.log("[razorpayWebhook] ✅ Found booking by razorpayOrderId!");
        }
      }
      
      if (!existingBooking) {
        console.error("[razorpayWebhook] ❌ BOOKING NOT FOUND USING ANY METHOD!");
        console.log("[razorpayWebhook] Attempted searches:");
        console.log("  1. By receipt (_id):", orderEntity.receipt);
        console.log("  2. By customBookingId:", paymentEntity.notes?.customBookingId || "N/A");
        console.log("  3. By bookingId from notes:", paymentEntity.notes?.bookingId || "N/A");
        console.log("  4. By razorpayOrderId:", orderEntity.id);
        
        // 🔍 DIAGNOSTIC: Check if ANY bookings exist
        console.log("\n[razorpayWebhook] 🔍 DIAGNOSTIC - Checking database:");
        try {
          const totalBookings = await Booking.countDocuments();
          console.log("  📊 Total bookings in database:", totalBookings);
          
          // Try to find recent bookings
          const recentBookings = await Booking.find()
            .sort({ bookingDate: -1 })
            .limit(5)
            .select('_id customBookingId razorpayOrderId paymentStatus');
          
          console.log("  📊 Recent bookings:");
          recentBookings.forEach((b, i) => {
            console.log(`    ${i + 1}. _id: ${b._id}, customId: ${b.customBookingId}, razorpayOrderId: ${b.razorpayOrderId || 'N/A'}, status: ${b.paymentStatus}`);
          });
          
          // Try searching with the customBookingId if it exists in notes
          if (paymentEntity.notes?.customBookingId) {
            const bookingByCustomId = await Booking.findOne({ 
              customBookingId: paymentEntity.notes.customBookingId 
            }).select('_id customBookingId razorpayOrderId paymentStatus');
            
            if (bookingByCustomId) {
              console.log("\n  ⚠️ IMPORTANT: Found booking by customBookingId but not by other methods!");
              console.log("  📋 Booking details:");
              console.log("    - _id:", bookingByCustomId._id.toString());
              console.log("    - customBookingId:", bookingByCustomId.customBookingId);
              console.log("    - razorpayOrderId:", bookingByCustomId.razorpayOrderId || 'N/A');
              console.log("    - paymentStatus:", bookingByCustomId.paymentStatus);
              console.log("  🔍 Comparing with what webhook received:");
              console.log("    - Receipt from webhook:", orderEntity.receipt);
              console.log("    - Match?", bookingByCustomId._id.toString() === orderEntity.receipt);
            }
          }
        } catch (dbError) {
          console.error("  ❌ Database diagnostic error:", dbError.message);
        }
        
        console.log("\n[razorpayWebhook] This could mean:");
        console.log("  1. The booking was deleted");
        console.log("  2. The order receipt doesn't match any booking _id");
        console.log("  3. Database connection issue");
        console.log("  4. Booking not yet saved when webhook arrived");
        console.log("  5. Receipt format mismatch (check logs above)");
        return res.status(404).json({ success: false, message: "Booking not found" });
      }

      console.log("[razorpayWebhook] ✅ Booking found using:", searchMethod);
      console.log("  - Booking _id:", existingBooking._id);
      console.log("  - Custom Booking ID:", existingBooking.customBookingId);
      console.log("  - Current Payment Status:", existingBooking.paymentStatus);
      console.log("  - Customer Name:", existingBooking.name);
      console.log("  - Customer Email:", existingBooking.email);
      console.log("  - Customer Phone:", existingBooking.phone);
      console.log("  - Razorpay Order ID:", existingBooking.razorpayOrderId || "N/A");

      // Check if already completed
      if (existingBooking.paymentStatus === "Completed") {
        console.log("[razorpayWebhook] ℹ️ Booking already confirmed, skipping update");
        return res.status(200).json({ 
          success: true, 
          message: "Booking already confirmed",
          bookingId: existingBooking.customBookingId 
        });
      }

      // ✅ Step 6: Update booking atomically (prevents duplicate updates)
      console.log("\n[razorpayWebhook] Step 6: Updating booking status to 'Completed' atomically...");
      const oldStatus = existingBooking.paymentStatus;
      
      // Use findOneAndUpdate with conditions to prevent race conditions
      const booking = await Booking.findOneAndUpdate(
        { 
          _id: orderEntity.receipt,
          paymentStatus: { $ne: "Completed" } // Only update if NOT already Completed
        },
        {
          $set: {
            paymentStatus: "Completed",
            paymentId: paymentEntity.id
          }
        },
        { 
          new: true, // Return updated document
          runValidators: true // Run model validators
        }
      );
      
      if (!booking) {
        console.log("[razorpayWebhook] ℹ️ Booking was already updated (race condition avoided)");
        return res.status(200).json({ 
          success: true, 
          message: "Booking already confirmed",
          bookingId: existingBooking.customBookingId 
        });
      }
      
      console.log("[razorpayWebhook] ✅ BOOKING UPDATED SUCCESSFULLY!");
      console.log("  - Status changed from:", oldStatus, "→", booking.paymentStatus);
      console.log("  - Payment ID:", booking.paymentId);
      console.log("  - Custom Booking ID:", booking.customBookingId);

      // Build frontend URL
      const frontendUrl = `https://www.waterparkchalo.com/ticket?bookingId=${booking.customBookingId}`;

      // ✅ Step 7: Respond to Razorpay immediately
      console.log("\n[razorpayWebhook] Step 7: Sending success response to Razorpay");
      const processingTime = Date.now() - startTime;
      console.log("[razorpayWebhook] Total processing time:", processingTime, "ms");
      
      res.status(200).json({
        success: true,
        message: "Payment processed successfully",
        bookingId: booking.customBookingId,
        frontendUrl,
        processingTime: processingTime + "ms"
      });

      // ✅ Step 8: Send notifications in background (non-blocking)
      console.log("\n[razorpayWebhook] Step 8: Sending notifications in background...");
      console.log("=".repeat(80) + "\n");
      
      (async () => {
        try {
          console.log("[razorpayWebhook] Starting background notifications for:", booking.customBookingId);
          
          const notificationResults = await Promise.allSettled([
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
            }).catch(err => {
              console.error("[razorpayWebhook] Customer WhatsApp error:", err.message);
              return { status: 'failed', error: err.message };
            }),
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
            }).catch(err => {
              console.error("[razorpayWebhook] Self WhatsApp error:", err.message);
              return { status: 'failed', error: err.message };
            }),
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
            }).catch(err => {
              console.error("[razorpayWebhook] Park WhatsApp error:", err.message);
              return { status: 'failed', error: err.message };
            }),
            sendEmail(
          [booking.email, "am542062@gmail.com"],
          `✅ Your Booking is Confirmed for ${booking.waterparkName}!`,
          `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Booking Confirmation</title>
            <style>
              body {
                margin: 0;
                padding: 0;
                background-color: #f4f4f7;
                font-family: Arial, sans-serif;
              }
              .container {
                max-width: 600px;
                margin: 20px auto;
                background-color: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                border: 1px solid #dee2e6;
              }
              .header {
                background-color: #007bff;
                color: #ffffff;
                padding: 30px 20px;
                text-align: center;
              }
              .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: bold;
              }
              .content {
                padding: 30px;
                color: #333333;
                line-height: 1.6;
              }
              .content h2 {
                color: #0056b3;
                font-size: 22px;
                margin-top: 0;
              }
              .details-table, .payment-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
              }
              .details-table td, .payment-table td {
                padding: 12px 0;
                font-size: 16px;
                border-bottom: 1px solid #eeeeee;
              }
              .details-table td:first-child {
                color: #555555;
              }
              .details-table td:last-child, .payment-table td:last-child {
                text-align: right;
                font-weight: bold;
              }
              .payment-table .total-due td {
                font-size: 20px;
                font-weight: bold;
                color: #d9534f;
              }
              .payment-table .paid td {
                color: #5cb85c;
              }
              .cta-button {
                display: block;
                width: 200px;
                margin: 30px auto;
                padding: 15px 20px;
                background-color: #007bff;
                color: #ffffff;
                text-align: center;
                text-decoration: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
              }
              .footer {
                text-align: center;
                padding: 20px;
                font-size: 12px;
                color: #888888;
                background-color: #f8f9fa;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${booking.waterparkName}</h1>
              </div>
              <div class="content">
                <h2>Your Booking is Confirmed!</h2>
                <p>Hello ${booking.name}, thank you for your booking! We are excited to welcome you for a day of fun and splashes. Please find your booking details below.</p>

                <table class="details-table">
                  <tr>
                    <td>Booking ID:</td>
                    <td style="font-family: monospace;">${booking.customBookingId}</td>
                  </tr>
                  <tr>
                    <td>Visit Date:</td>
                    <td>${new Date(booking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                  </tr>
                  <tr>
                    <td>Guests:</td>
                    <td>${booking.adults} Adult(s), ${booking.children} Child(ren)</td>
                  </tr>
                   <tr>
                    <td>Phone:</td>
                    <td>${booking.phone}</td>
                  </tr>
                </table>

                <h2 style="margin-top: 30px;">Payment Summary</h2>
                <table class="payment-table">
                  <tr>
                    <td>Total Amount:</td>
                    <td>₹${booking.totalAmount.toFixed(2)}</td>
                  </tr>
                  <tr class="paid">
                    <td>Advance Paid:</td>
                    <td>₹${booking.advanceAmount.toFixed(2)}</td>
                  </tr>
                  <tr class="total-due">
                    <td>Amount Due at Park:</td>
                    <td>₹${booking.leftamount.toFixed(2)}</td>
                  </tr>
                </table>
                
                <a href="https://waterpark-frontend.vercel.app/booking/${booking.customBookingId}" class="cta-button" style="color: #ffffff;">View Your Ticket</a>
                
                <p style="text-align: center; color: #555;">Please show the ticket at the ticket counter upon your arrival.</p>
              </div>
              <div class="footer">
                <p>This is an automated email. Please do not reply.</p>
                <p>&copy; ${new Date().getFullYear()} ${booking.waterparkName}. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
          `
        ).catch(err => {
              console.error("[razorpayWebhook] Email error:", err.message);
              return { status: 'failed', error: err.message };
            })
          ]);
          
          // Log notification results
          console.log("[razorpayWebhook] ✅ All notifications completed");
          console.log("[razorpayWebhook] Notification results:");
          notificationResults.forEach((result, index) => {
            const names = ['Customer WhatsApp', 'Self WhatsApp', 'Park WhatsApp', 'Email'];
            console.log(`  - ${names[index]}: ${result.status}`);
            if (result.status === 'rejected' && result.reason) {
              console.log(`    Error: ${result.reason.message || result.reason}`);
            }
          });
        } catch (err) {
          console.error("[razorpayWebhook] Notification batch error:", err);
        }
      })();

      return; // stop here - response already sent
    } else {
      // ✅ Handle other events (not payment.captured)
      console.log("\n[razorpayWebhook] ℹ️ Unhandled event type:", event);
      console.log("[razorpayWebhook] This event will be acknowledged but not processed");
      console.log("=".repeat(80) + "\n");
      return res.status(200).json({ success: true, message: "Event received but not processed" });
    }
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("[razorpayWebhook] ❌ CRITICAL ERROR!");
    console.error("=".repeat(80));
    console.error("[razorpayWebhook] Error type:", error.name);
    console.error("[razorpayWebhook] Error message:", error.message);
    console.error("[razorpayWebhook] Error stack:", error.stack);
    console.error("=".repeat(80) + "\n");
    
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
      error: error.message,
    });
  }
};


exports.testRazorpayConfig = async (req, res) => {
  console.log("[testRazorpayConfig] Testing Razorpay setup...");
  try {
    const config = {
      key_id: process.env.RAZORPAY_KEY_ID ? "Configured" : "Missing",
      key_secret: process.env.RAZORPAY_KEY_SECRET ? "Configured" : "Missing",
      webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET ? "Configured" : "Missing",
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

// ----------------------------
// Test Webhook Endpoint
// ----------------------------
exports.testWebhook = async (req, res) => {
  console.log("\n" + "=".repeat(80));
  console.log("[testWebhook] 🧪 WEBHOOK TEST ENDPOINT CALLED");
  console.log("=".repeat(80));
  console.log("[testWebhook] Timestamp:", new Date().toISOString());
  console.log("[testWebhook] Request body:", JSON.stringify(req.body, null, 2));
  console.log("[testWebhook] Headers:", JSON.stringify(req.headers, null, 2));
  console.log("=".repeat(80) + "\n");
  
  try {
    const diagnostics = {
      success: true,
      message: "Webhook test endpoint is working perfectly!",
      timestamp: new Date().toISOString(),
      environment: {
        razorpay_key_id: process.env.RAZORPAY_KEY_ID ? "✅ Configured" : "❌ Missing",
        razorpay_key_secret: process.env.RAZORPAY_KEY_SECRET ? "✅ Configured" : "❌ Missing",
        razorpay_webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET ? "✅ Configured" : "❌ Missing",
        database_connected: mongoose.connection.readyState === 1 ? "✅ Connected" : "❌ Disconnected"
      },
      request: {
        body: req.body,
        headers: req.headers,
        method: req.method,
        path: req.path,
        query: req.query
      },
      endpoints: {
        webhook_url: "/api/bookings/webhook/razorpay",
        status_check_url: "/api/bookings/status/:customBookingId",
        test_config_url: "/api/bookings/test/razorpay/config",
        test_webhook_url: "/api/bookings/test/webhook"
      }
    };

    console.log("[testWebhook] Diagnostics:", JSON.stringify(diagnostics, null, 2));
    
    return res.status(200).json(diagnostics);
  } catch (error) {
    console.error("[testWebhook] ❌ Error:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook test failed",
      error: error.message,
      stack: error.stack
    });
  }
};