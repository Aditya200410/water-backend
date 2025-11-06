// File: admin/backend/controllers/bookingController.js
const Booking = require("../models/Booking");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { sendWhatsAppMessage } = require("../service/whatsappService");
const {selfWhatsAppMessage }= require("../service/whatsappself");
const {parkWhatsAppMessage }= require("../service/whatsapppark")
const Counter = require("../models/Counter")
const axios = require("axios");
// Import PhonePe token function from phonepeController
let phonePeOauthToken = null;
let phonePeTokenExpiry = null;

// Get PhonePe OAuth token (same logic as phonepeController)
async function getPhonePeToken() {
  try {
    // Check if we have a valid cached token
    if (phonePeOauthToken && phonePeTokenExpiry && new Date() < phonePeTokenExpiry) {
      return phonePeOauthToken;
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
    

    console.log('[createBooking] Getting PhonePe OAuth token from:', oauthUrl);

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
      phonePeOauthToken = response.data.access_token;
      // Set expiry based on expires_at field from response
      if (response.data.expires_at) {
        phonePeTokenExpiry = new Date(response.data.expires_at * 1000); // Convert from seconds to milliseconds
      } else {
        // Fallback to 1 hour if expires_at is not provided
        phonePeTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
      }
      
      console.log('[createBooking] PhonePe OAuth token obtained successfully');
      return phonePeOauthToken;
    } else {
      throw new Error('Invalid OAuth response from PhonePe');
    }
  } catch (error) {
    console.error('[createBooking] PhonePe OAuth token error:', error.response?.data || error.message);
    throw new Error('Failed to get PhonePe OAuth token');
  }
}

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
// PhonePe Integration (replacing Razorpay)
// ----------------------------
// PhonePe functions are imported from phonepeController.js

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
      paymentStatus: paymentMethod === "cash" ? "Pending" : "Initiated",
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

    // ✅ PhonePe Payment
    if (paymentMethod === "phonepe") {
      console.log("[createBooking] Creating PhonePe order for booking:", booking.customBookingId);
      
      try {
        // Get OAuth token
        const accessToken = await getPhonePeToken();

        const env = process.env.PHONEPE_ENV || 'sandbox';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        // Set base URL for payment API
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
            udf7: waternumber || ''
          },
          paymentFlow: {
            type: 'PG_CHECKOUT',
            message: `Payment for booking ${booking.customBookingId}`,
            merchantUrls: {
              redirectUrl: `${frontendUrl.replace(/\/+$/, '')}/payment/status?orderId=${merchantOrderId}&bookingId=${booking.customBookingId}`
            }
          }
        };

        console.log('[createBooking] Making PhonePe API request to:', baseUrl + apiEndpoint);
        
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
        if (response.data && response.data.orderId) {
          const redirectUrl = response.data.redirectUrl;
          const orderId = response.data.orderId;

          // Save PhonePe order IDs to booking
          booking.phonepeOrderId = orderId;
          booking.phonepeMerchantOrderId = merchantOrderId;
          await booking.save();
          console.log('[createBooking] Saved PhonePe order ID to booking:', orderId);

          return res.status(200).json({
            success: true,
            message: "PhonePe order created",
            redirectUrl: redirectUrl,
            orderId: orderId,
            merchantOrderId: merchantOrderId,
            booking,
          });
        } else {
          console.error('[createBooking] PhonePe did not return redirect URL:', response.data);
          return res.status(500).json({ 
            success: false, 
            message: 'PhonePe did not return a redirect URL.',
            booking
          });
        }
      } catch (error) {
        console.error('[createBooking] PhonePe order creation error:', error.response?.data || error.message);
        return res.status(500).json({
          success: false,
          message: error.response?.data?.message || 'Failed to create PhonePe order',
          booking,
          error: error.message
        });
      }
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
// Verify PhonePe Payment
// ----------------------------
exports.verifyPayment = async (req, res) => {
  console.log("[verifyPayment] Request body:", req.body);

  try {
    const {
      orderId, // PhonePe orderId (transaction ID)
      merchantOrderId, // PhonePe merchantOrderId
      bookingId, // customBookingId
    } = req.body;

    if (!orderId || !bookingId) {
      console.warn("[verifyPayment] Missing required fields.");
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields: orderId and bookingId are required" });
    }

    // Find booking by customBookingId
    const booking = await Booking.findOne({ customBookingId: bookingId });
    if (!booking) {
      console.warn("[verifyPayment] Booking not found:", bookingId);
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    // Check PhonePe payment status
    try {
      const accessToken = await getPhonePeToken();
      const env = process.env.PHONEPE_ENV || 'sandbox';
      const baseUrl = env === 'production' 
        ? 'https://api.phonepe.com/apis/pg'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
      const apiEndpoint = `/checkout/v2/order/${orderId}/status`;
      
      console.log(`[verifyPayment] Checking PhonePe status for orderId: ${orderId}`);
      
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

      console.log('[verifyPayment] PhonePe status response:', statusResponse.data);

      if (statusResponse.data && statusResponse.data.state === 'COMPLETED') {
        // Payment successful - update booking
        booking.paymentStatus = "Completed";
        booking.paymentType = "PhonePe";
        booking.paymentId = orderId;
        
        // Save booking with validation
        try {
          await booking.save();
          console.log(
            "[verifyPayment] Booking updated with payment success:",
            booking.customBookingId,
            "Payment Status:",
            booking.paymentStatus,
            "Payment Type:",
            booking.paymentType,
            "Payment ID:",
            booking.paymentId
          );
          
          // Verify the save was successful by fetching the booking again
          const savedBooking = await Booking.findOne({ customBookingId: booking.customBookingId });
          if (savedBooking && savedBooking.paymentStatus === "Completed") {
            console.log("[verifyPayment] ✅ Booking successfully saved with paymentStatus: Completed");
          } else {
            console.error("[verifyPayment] ⚠️ Warning: Booking save verification failed");
          }
        } catch (saveError) {
          console.error("[verifyPayment] Error saving booking:", saveError);
          throw new Error("Failed to save booking with payment status");
        }

        // ✅ Use the readable customBookingId for the frontend URL
        const frontendUrl = `https://www.waterparkchalo.com/ticket?bookingId=${booking.customBookingId}`;
        console.log("[verifyPayment] Ticket URL:", frontendUrl);

        // ✅ Send all notifications in parallel for faster response
        console.log("[verifyPayment] Sending notifications in parallel...");
        
        // Send notifications in background (don't block response)
        (async () => {
          try {
            console.log("[verifyPayment] Starting background notifications for:", booking.customBookingId);
            
            const notificationResults = await Promise.allSettled([
              // Customer WhatsApp
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
                console.error("[verifyPayment] Customer WhatsApp error:", err.message);
                return { status: 'failed', error: err.message };
              }),
              
              // Self WhatsApp
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
                console.error("[verifyPayment] Self WhatsApp error:", err.message);
                return { status: 'failed', error: err.message };
              }),

              // Park WhatsApp
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
                console.error("[verifyPayment] Park WhatsApp error:", err.message);
                return { status: 'failed', error: err.message };
              }),

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
                      
                      <a href="https://www.waterparkchalo.com/ticket?bookingId=${booking.customBookingId}" class="cta-button" style="color: #ffffff;">View Your Ticket</a>
                      
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
                console.error("[verifyPayment] Email error:", err.message);
                return { status: 'failed', error: err.message };
              })
            ]);

            console.log("[verifyPayment] All notifications completed:", notificationResults.map(r => r.status));
            console.log("[verifyPayment] Notification results:", notificationResults);
          } catch (error) {
            console.error("[verifyPayment] Error in background notifications:", error);
          }
        })();

        return res
          .status(200)
          .json({
            success: true,
            message: "Payment verified successfully",
            booking,
            frontendUrl,
          });
      } else if (statusResponse.data && statusResponse.data.state === 'FAILED') {
        // Payment failed
        console.log("[verifyPayment] Payment failed for booking:", bookingId);
        return res
          .status(400)
          .json({ 
            success: false, 
            message: "Payment failed",
            errorCode: statusResponse.data.errorCode,
            detailedErrorCode: statusResponse.data.detailedErrorCode
          });
      } else {
        // Payment pending
        console.log("[verifyPayment] Payment pending for booking:", bookingId);
        return res
          .status(200)
          .json({ 
            success: false, 
            message: "Payment is pending",
            state: statusResponse.data?.state || 'PENDING'
          });
      }
    } catch (statusError) {
      console.error("[verifyPayment] PhonePe status check error:", statusError);
      return res
        .status(500)
        .json({ 
          success: false, 
          message: "Failed to verify payment with PhonePe",
          error: statusError.message
        });
    }
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
      booking: {
        customBookingId: booking.customBookingId,
        paymentStatus: booking.paymentStatus,
        paymentId: booking.paymentId,
        bookingDate: booking.bookingDate
      }
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
    // Include all bookings but prioritize completed ones
    const orders = await Booking.find({
      email: { $regex: new RegExp(`^${userEmail}$`, "i") },
    })
    .sort({ 
      paymentStatus: -1, // Completed first
      bookingDate: -1 
    });

    const completedCount = orders.filter(o => o.paymentStatus === "Completed").length;
    console.log(`[getOrdersByEmail] Found ${orders.length} bookings for email: ${userEmail}`);
    console.log(`[getOrdersByEmail] Completed bookings: ${completedCount}`);

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
    const bookings = await Booking.find(query)
      .sort({ 
        paymentStatus: -1, // Completed first
        bookingDate: -1 
      });
    
    const completedCount = bookings.filter(b => b.paymentStatus === "Completed").length;
    console.log("[getUserBookings] Bookings found:", bookings.length, `(Completed: ${completedCount})`);

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
            paymentId: paymentEntity.id,
            paymentType: "Razorpay"
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