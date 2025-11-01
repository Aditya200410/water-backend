const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();
const Booking = require('../models/Booking');

// Cache for OAuth token
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
    // Based on PhonePe documentation: https://developer.phonepe.com/v1/reference/authorization-standard-checkout/
    let oauthUrl;
    if (env === 'production') 
      oauthUrl = 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';
    else
      oauthUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';
    

    console.log('Getting PhonePe OAuth token from:', oauthUrl);

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
      
      console.log('PhonePe OAuth token obtained successfully');
      console.log('Token expires at:', tokenExpiry);
      return oauthToken;
    } else {
      throw new Error('Invalid OAuth response from PhonePe');
    }
  } catch (error) {
    console.error('PhonePe OAuth token error:', error.response?.data || error.message);
    throw new Error('Failed to get PhonePe OAuth token');
  }
}

exports.createPhonePeOrder = async (req, res) => {
  try {
    const { 
      amount, 
      customerName, 
      email, 
      phone, 
      items, 
      totalAmount, 
      shippingCost, 
      codExtraCharge, 
      finalTotal, 
      paymentMethod, 
      upfrontAmount,
      remainingAmount,
      sellerToken,
      couponCode 
    } = req.body;
    
    const env = process.env.PHONEPE_ENV || 'sandbox';
    const frontendUrl = process.env.FRONTEND_URL;
    const backendUrl = process.env.BACKEND_URL;

    // Enhanced validation
    if (!frontendUrl || !backendUrl) {
      console.error('URL configuration missing:', { 
        frontendUrl: !!frontendUrl, 
        backendUrl: !!backendUrl 
      });
      return res.status(500).json({
        success: false,
        message: 'Application configuration missing. Please contact support.',
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount provided' 
      });
    }

    if (!customerName || !email || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer details are required' 
      });
    }

    // Validate phone number format
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please enter a valid 10-digit mobile number.'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format.'
      });
    }

    // Get OAuth token
    const accessToken = await getPhonePeToken();

    // Set base URL for payment API based on PhonePe documentation
    // Based on: https://developer.phonepe.com/v1/reference/create-payment-standard-checkout
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/pg'
      : '	https://api-preprod.phonepe.com/apis/pg-sandbox';

    const apiEndpoint = '/checkout/v2/pay';

    const merchantOrderId = `MT${Date.now()}${Math.random().toString(36).substr(2, 6)}`;

    // Prepare payload according to PhonePe API documentation
    // Based on: https://developer.phonepe.com/v1/reference/create-payment-standard-checkout
    const payload = {
      merchantOrderId: merchantOrderId,
      amount: Math.round(amount * 100), // Convert to paise
      expireAfter: 1200, // 20 minutes expiry
      metaInfo: {
        udf1: customerName,
        udf2: email,
        udf3: phone,
        udf4: sellerToken || '',
        udf5: couponCode || '',
        udf6: upfrontAmount ? `upfront:${upfrontAmount}` : '',
        udf7: remainingAmount ? `remaining:${remainingAmount}` : ''
      },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: paymentMethod === 'cod' 
          ? `Upfront payment ₹${upfrontAmount} for COD order ${merchantOrderId}`
          : `Payment for order ${merchantOrderId}`,
        merchantUrls: {
          redirectUrl: `${frontendUrl.replace(/\/+$/, '')}/payment/status?orderId=${merchantOrderId}`
        }
      }
    };

    console.log('PhonePe payload:', {
      ...payload,
      amount: payload.amount,
      accessToken: '***HIDDEN***'
    });

    console.log(`Making PhonePe API request to: ${baseUrl}${apiEndpoint}`);
    
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

    console.log('PhonePe API response:', response.data);

    // Success response from PhonePe
    if (response.data && response.data.orderId) {
      const redirectUrl = response.data.redirectUrl;
      const orderId = response.data.orderId;
      const state = response.data.state;

      if (redirectUrl) {
        const orderData = {
          merchantOrderId,
          orderId,
          customerName,
          email,
          phone,
          items,
          totalAmount,
          shippingCost,
          codExtraCharge,
          finalTotal,
          paymentMethod,
          upfrontAmount: upfrontAmount || 0,
          remainingAmount: remainingAmount || 0,
          sellerToken,
          couponCode,
          status: state || 'pending',
          createdAt: new Date()
        };

        console.log('PhonePe order created successfully:', {
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          state: state,
          redirectUrl: redirectUrl.substring(0, 100) + '...'
        });

        return res.json({ 
          success: true, 
          redirectUrl,
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          state: state,
          orderData 
        });
      } else {
        console.error('PhonePe did not return redirect URL:', response.data);
        return res.status(500).json({ 
          success: false, 
          message: 'PhonePe did not return a redirect URL.',
          data: response.data 
        });
      }
    } else {
      console.error('PhonePe payment initiation failed:', response.data);
      return res.status(500).json({
        success: false,
        message: response.data.message || 'PhonePe payment initiation failed',
        data: response.data
      });
    }

  } catch (error) {
    console.error('PhonePe order error:', error.response?.data || error.message);
    console.error('PhonePe order error stack:', error.stack);

    let errorMessage = 'Failed to create PhonePe order';
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Payment gateway timeout. Please try again.';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Payment gateway not reachable. Please try again.';
    } else if (error.response?.status === 500) {
      errorMessage = 'Payment gateway error. Please try again later.';
    } else if (error.response?.status === 400) {
      errorMessage = 'Invalid payment request. Please check your details.';
    } else if (error.response?.status === 401) {
      errorMessage = 'Payment gateway authentication failed. Please try again.';
    }

    return res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.response?.data || error.message
    });
  }
};

exports.phonePeCallback = async (req, res) => {
  try {
    // Accept both merchantOrderId and orderId, but use orderId for status check
    const { merchantOrderId, orderId, amount, status, code, merchantId } = req.body;
    console.log('PhonePe callback received:', req.body);
    if (!merchantOrderId || !orderId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Invalid callback data: merchantOrderId, orderId, and status are required'
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
      console.log('PhonePe verification response:', response.data);
      
      // Find booking by merchantOrderId or orderId
      let booking = await Booking.findOne({ phonepeMerchantOrderId: merchantOrderId });
      if (!booking) {
        booking = await Booking.findOne({ phonepeOrderId: orderId });
      }
      
      if (response.data && response.data.state === 'COMPLETED') {
        console.log(`Payment completed for transaction: ${merchantOrderId}`);
        
        // Update booking in DB if found
        if (booking) {
          // Check if already completed to avoid duplicate updates
          if (booking.paymentStatus === "Completed") {
            console.log('Booking already confirmed, skipping update');
            return res.json({
              success: true,
              message: 'Booking already confirmed',
              orderId: orderId,
              merchantOrderId: merchantOrderId,
              bookingId: booking.customBookingId,
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
            console.log('Booking was already updated (race condition avoided)');
            return res.json({
              success: true,
              message: 'Booking already confirmed',
              orderId: orderId,
              merchantOrderId: merchantOrderId,
              bookingId: booking.customBookingId,
              status: 'COMPLETED'
            });
          }

          console.log('✅ BOOKING UPDATED SUCCESSFULLY!');
          console.log('  - Custom Booking ID:', updatedBooking.customBookingId);
          console.log('  - Payment Status:', updatedBooking.paymentStatus);
          console.log('  - Payment ID:', updatedBooking.paymentId);
        } else {
          console.warn('Booking not found for transactionId:', orderId);
        }
        
        return res.json({
          success: true,
          message: 'Payment completed successfully',
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          bookingId: booking?.customBookingId,
          status: 'COMPLETED'
        });
      } else if (response.data && response.data.state === 'FAILED') {
        console.log(`Payment failed for transaction: ${merchantOrderId}`);
        
        // Update booking status to Failed if found
        if (booking) {
          await Booking.findOneAndUpdate(
            { _id: booking._id },
            { $set: { paymentStatus: "Failed" } },
            { new: true }
          );
        }
        
        return res.json({
          success: false,
          message: 'Payment failed',
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          bookingId: booking?.customBookingId,
          status: 'FAILED',
          errorCode: response.data.errorCode,
          detailedErrorCode: response.data.detailedErrorCode
        });
      } else {
        console.log(`Payment pending for transaction: ${merchantOrderId}`);
        return res.json({
          success: true,
          message: 'Payment is pending',
          orderId: orderId,
          merchantOrderId: merchantOrderId,
          bookingId: booking?.customBookingId,
          status: 'PENDING'
        });
      }
    } catch (verificationError) {
      console.error('PhonePe verification error:', verificationError);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify payment with PhonePe'
      });
    }
  } catch (error) {
    console.error('PhonePe callback error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process callback'
    });
  }
};

exports.getPhonePeStatus = async (req, res) => {
  try {
    // Accept both merchantOrderId and orderId, but use orderId for status check
    let { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'PhonePe orderId (transaction ID) is required'
      });
    }
    
    // Store original orderId for logging and potential fallback
    const originalOrderId = String(orderId).trim();
    
    // PhonePe orderIds can contain colons (e.g., "OMO2511012306208273028508W:1")
    // Try with the original orderId first, then sanitize if needed
    let sanitizedOrderId = String(orderId).split(':')[0].split(';')[0].trim();
    
    console.log(`[getPhonePeStatus] Original orderId: ${originalOrderId}`);
    console.log(`[getPhonePeStatus] Sanitized orderId: ${sanitizedOrderId}`);
    
    if (!originalOrderId || originalOrderId.length === 0) {
      console.error('[getPhonePeStatus] Invalid orderId:', originalOrderId);
      return res.status(400).json({
        success: false,
        message: 'Invalid PhonePe orderId format',
        originalOrderId: originalOrderId
      });
    }
    
    const env = process.env.PHONEPE_ENV || 'sandbox';
    let accessToken;
    try {
      accessToken = await getPhonePeToken();
    } catch (tokenError) {
      console.error('[getPhonePeStatus] Failed to get PhonePe token:', tokenError);
      return res.status(500).json({
        success: false,
        message: 'Failed to authenticate with PhonePe',
        error: tokenError.message
      });
    }
    
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/pg'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    
    // Try with original orderId first (PhonePe may expect the full orderId with colon)
    // URL encode the orderId to handle special characters safely in URL path
    let orderIdToUse = originalOrderId;
    let encodedOrderId = encodeURIComponent(originalOrderId);
    let apiEndpoint = `/checkout/v2/order/${encodedOrderId}/status`;
    let fullUrl = `${baseUrl}${apiEndpoint}`;
    
    console.log(`[getPhonePeStatus] Attempting PhonePe API call with original orderId: ${originalOrderId}`);
    console.log(`[getPhonePeStatus] Encoded orderId: ${encodedOrderId}`);
    console.log(`[getPhonePeStatus] API URL: ${fullUrl}`);
    
    let response;
    try {
      response = await axios.get(
        fullUrl,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `O-Bearer ${accessToken}`
          },
          timeout: 30000
        }
      );
      console.log(`[getPhonePeStatus] ✅ API call succeeded with original orderId`);
    } catch (apiError) {
      // If API call fails with original orderId, try with sanitized orderId
      if (sanitizedOrderId !== originalOrderId && apiError.response?.status === 400) {
        console.log(`[getPhonePeStatus] API call failed with original orderId (status: ${apiError.response?.status}), trying with sanitized: ${sanitizedOrderId}`);
        
        const encodedSanitizedOrderId = encodeURIComponent(sanitizedOrderId);
        const sanitizedApiEndpoint = `/checkout/v2/order/${encodedSanitizedOrderId}/status`;
        const sanitizedFullUrl = `${baseUrl}${sanitizedApiEndpoint}`;
        
        try {
          response = await axios.get(
            sanitizedFullUrl,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `O-Bearer ${accessToken}`
              },
              timeout: 30000
            }
          );
          // If sanitized works, use it
          orderIdToUse = sanitizedOrderId;
          console.log(`[getPhonePeStatus] ✅ Successfully used sanitized orderId: ${sanitizedOrderId}`);
        } catch (sanitizedError) {
          // If both fail, log and throw the original error with better message
          console.error(`[getPhonePeStatus] Both original and sanitized orderIds failed`);
          console.error(`[getPhonePeStatus] Original error:`, apiError.response?.data || apiError.message);
          console.error(`[getPhonePeStatus] Sanitized error:`, sanitizedError.response?.data || sanitizedError.message);
          throw apiError;
        }
      } else {
        throw apiError;
      }
    }
    console.log('PhonePe status response:', response.data);
    
    // Try to extract merchantOrderId from metaInfo if available
    let merchantOrderId = null;
    if (response.data && response.data.metaInfo && response.data.metaInfo.merchantOrderId) {
      merchantOrderId = response.data.metaInfo.merchantOrderId;
    }
    
    // Find booking by orderId or merchantOrderId
    // Try to find booking with both the orderId that worked and the original/sanitized versions
    let booking = null;
    if (orderIdToUse) {
      // Try with the orderId that worked for API call
      booking = await Booking.findOne({ phonepeOrderId: orderIdToUse });
      
      // If not found and we used sanitized, try with original
      if (!booking && orderIdToUse === sanitizedOrderId && originalOrderId !== sanitizedOrderId) {
        booking = await Booking.findOne({ phonepeOrderId: originalOrderId });
        console.log(`[getPhonePeStatus] Tried original orderId for booking lookup: ${originalOrderId}`);
      }
      
      // If not found and we used original, try with sanitized
      if (!booking && orderIdToUse === originalOrderId && sanitizedOrderId !== originalOrderId) {
        booking = await Booking.findOne({ phonepeOrderId: sanitizedOrderId });
        console.log(`[getPhonePeStatus] Tried sanitized orderId for booking lookup: ${sanitizedOrderId}`);
      }
    }
    if (!booking && merchantOrderId) {
      booking = await Booking.findOne({ phonepeMerchantOrderId: merchantOrderId });
    }
    
    // Update booking status based on PhonePe response
    if (response.data && response.data.state) {
      if (booking) {
        if (response.data.state === 'COMPLETED') {
          // Only update if not already Completed
          if (booking.paymentStatus !== "Completed") {
            await Booking.findOneAndUpdate(
              { 
                _id: booking._id,
                paymentStatus: { $ne: "Completed" }
              },
              {
                $set: {
                  paymentStatus: "Completed",
                  paymentId: orderIdToUse
                }
              },
              { new: true }
            );
            console.log(`Updated booking ${booking.customBookingId} to Completed`);
          }
        } else if (response.data.state === 'FAILED') {
          // Update to Failed if not already Completed
          if (booking.paymentStatus !== "Completed") {
            await Booking.findOneAndUpdate(
              { _id: booking._id },
              { $set: { paymentStatus: "Failed" } },
              { new: true }
            );
            console.log(`Updated booking ${booking.customBookingId} to Failed`);
          }
        }
      }
      
      return res.json({
        success: response.data.state === 'COMPLETED',
        data: {
          orderId: response.data.orderId,
          merchantOrderId,
          state: response.data.state,
          amount: response.data.amount,
          expireAt: response.data.expireAt,
          paymentDetails: response.data.paymentDetails || [],
          errorCode: response.data.errorCode,
          detailedErrorCode: response.data.detailedErrorCode,
          errorContext: response.data.errorContext,
          bookingId: booking?.customBookingId
        },
        message: response.data.state === 'COMPLETED' ? 'Payment completed' : (response.data.state === 'FAILED' ? 'Payment failed' : 'Payment pending')
      });
    } else if (response.data && response.data.success === false) {
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to get transaction status',
        code: response.data.code
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid response from PhonePe'
      });
    }
  } catch (error) {
    const phonePeError = error.response?.data;
    const statusCode = error.response?.status;
    console.error('[getPhonePeStatus] PhonePe API error:', {
      status: statusCode,
      data: phonePeError,
      message: error.message,
      orderId: orderId,
      url: error.config?.url
    });
    
    // Handle specific error responses from PhonePe
    if (statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: phonePeError?.message || 'Invalid request to PhonePe API',
        code: phonePeError?.code,
        phonePeMessage: phonePeError?.message,
        orderId: orderId
      });
    }
    
    if (phonePeError && typeof phonePeError === 'object') {
      return res.status(statusCode || 500).json({
        success: false,
        message: phonePeError.message || 'PhonePe API error',
        code: phonePeError.code,
        data: phonePeError.data || null,
        orderId: orderId
      });
    }
    
    if (statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: 'Order not found in PhonePe system',
        orderId: orderId
      });
    } else if (statusCode === 401) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed with PhonePe'
      });
    } else if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        message: 'Request timeout - PhonePe API did not respond in time'
      });
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'PhonePe API is not reachable'
      });
    }
    
    return res.status(statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to check transaction status',
      orderId: orderId
    });
  }
};

// Refund API implementation
exports.refundPayment = async (req, res) => {
  try {
    const { merchantRefundId, originalMerchantOrderId, amount } = req.body;
    
    if (!merchantRefundId || !originalMerchantOrderId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Refund details are required'
      });
    }
    
           const env = process.env.PHONEPE_ENV || 'sandbox';
    const accessToken = await getPhonePeToken();
    
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/pg'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    
    const apiEndpoint = '/payments/v2/refund';
    
    const payload = {
      merchantRefundId,
      originalMerchantOrderId,
      amount: Math.round(amount * 100) // Convert to paise
    };
    
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
    
    if (response.data && response.data.success) {
      return res.json({
        success: true,
        data: response.data.data
      });
    } else {
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to process refund'
      });
    }
    
  } catch (error) {
    console.error('PhonePe refund error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to process refund'
    });
  }
};

// Refund status check
exports.getRefundStatus = async (req, res) => {
  try {
    const { merchantRefundId } = req.params;
    
    if (!merchantRefundId) {
      return res.status(400).json({
        success: false,
        message: 'Refund ID is required'
      });
    }
    
      const env = process.env.PHONEPE_ENV || 'sandbox';
    const accessToken = await getPhonePeToken();
    
    const baseUrl = env === 'production' 
      ? 'https://api.phonepe.com/apis/pg'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    
    const apiEndpoint = `/payments/v2/refund/${merchantRefundId}/status`;
    
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
    
    if (response.data && response.data.success) {
      return res.json({
        success: true,
        data: response.data.data
      });
    } else {
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to get refund status'
      });
    }
    
  } catch (error) {
    console.error('PhonePe refund status error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to check refund status'
    });
  }
};