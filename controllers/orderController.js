const Order = require('../models/Order');
const Seller = require('../models/Seller');
const fs = require('fs').promises;
const path = require('path');
const ordersJsonPath = path.join(__dirname, '../data/orders.json');
const Product = require('../models/Product');
const commissionController = require('./commissionController');
const nodemailer = require('nodemailer');
const { sendWhatsAppMessage } = require("../service/whatsappService.js");

// Setup nodemailer transporter (reuse config from auth.js)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Create a new order
const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      country,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus,
      upfrontAmount,
      remainingAmount,
      sellerToken, // Get seller token from request
      transactionId, // PhonePe transaction ID
      couponCode, // Coupon code if applied
    } = req.body;

    // Comprehensive validation
    const requiredFields = ['customerName', 'email', 'phone', 'address', 'city', 'state', 'pincode', 'country', 'items', 'totalAmount', 'paymentMethod', 'paymentStatus'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Items array is required and must not be empty.' 
      });
    }

    // Validate each item has required fields
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemRequiredFields = ['name', 'price', 'adultquantity', 'childquantity'];
      const missingItemFields = itemRequiredFields.filter(field => !item[field]);
      
      if (missingItemFields.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Item ${i + 1} is missing required fields: ${missingItemFields.join(', ')}` 
        });
      }
    }

    // Map paymentStatus to valid enum values
    let mappedPaymentStatus = paymentStatus;
    if (paymentStatus === 'partial' || paymentStatus === 'processing') {
      mappedPaymentStatus = 'pending';
    }
    if (!['pending', 'completed', 'failed'].includes(mappedPaymentStatus)) {
      mappedPaymentStatus = 'pending';
    }

    // Support both address as string (street) and as object
    let addressObj;
    if (typeof address === 'object' && address !== null) {
      addressObj = {
        street: address.street || '',
        city: address.city || city || '',
        state: address.state || state || '',
        pincode: address.pincode || pincode || '',
        country: address.country || country || '',
      };
    } else {
      addressObj = {
        street: address || '',
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        country: country || '',
      };
    }

    const newOrder = new Order({
      customerName,
      email,
      phone,
      address: addressObj,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus: mappedPaymentStatus,
      upfrontAmount: upfrontAmount || 0,
      remainingAmount: remainingAmount || 0,
      sellerToken,
      transactionId,
      couponCode,
    });

    const savedOrder = await newOrder.save();
    
 // 2. Send WhatsApp confirmation
    await sendWhatsAppMessage({
      id: savedOrder._id.toString(),
      customerName: savedOrder.customerName,
      customerPhone: savedOrder.phone,
      totalAmount: savedOrder.totalAmount,
      adultquantity:savedOrder.adultquantity,
      childquantity:savedOrder.childquantity,
      totalAmount:savedOrder.totalAmount,
      left:(savedOrder.totalAmount)-(savedOrder.advanaceprice)
    });
    // Calculate commission if seller token is provided
    let commission = 0;
    let seller = null;
    
    console.log('Order creation - sellerToken received:', sellerToken);
    
    if (sellerToken) {
      seller = await Seller.findOne({ sellerToken });
      console.log('Seller found:', seller ? seller.businessName : 'Not found');
      
      if (seller) {
        commission = totalAmount * 0.30; // 30% commission
        
        // Create commission history entry
        try {
          await commissionController.createCommissionEntry(
            savedOrder._id, 
            seller._id, 
            totalAmount, 
            0.30 // 30% commission rate
          );
          console.log(`Commission entry created for seller ${seller.businessName}: ₹${commission}`);
        } catch (commissionError) {
          console.error('Failed to create commission entry:', commissionError);
          // Continue with order creation even if commission entry fails
        }
      } else {
        console.log('No seller found with token:', sellerToken);
      }
    } else {
      console.log('No sellerToken provided in order');
    }

    // Decrement stock for each product in the order
    for (const item of items) {
      if (item.productId) {
        const product = await Product.findById(item.productId);
        if (product) {
        product.stock = Math.max(0, (product.stock || 0) - ((item.adultquantity || 0) + (item.childquantity || 0)));

          if (product.stock === 0) {
            product.inStock = false;
          }
          await product.save();
        }
      }
    }

    // Save to orders.json for admin
    await appendOrderToJson(savedOrder);

    // Send order confirmation email (non-blocking)
    sendOrderConfirmationEmail(savedOrder);
    
    res.status(201).json({ 
      success: true, 
      message: 'Order created successfully!', 
      order: savedOrder,
      commission: seller ? { amount: commission, sellerName: seller.businessName } : null
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, message: 'Failed to create order.', error: error.message });
  }
};

// Get all orders for a specific user by email
const getOrdersByEmail = async (req, res) => {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }
    // Case-insensitive search for email
    const orders = await Order.find({ email: { $regex: new RegExp(`^${userEmail}$`, 'i') } }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders.', error: error.message });
  }
};

// Get a single order by its ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('Error fetching order by ID:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order.', error: error.message });
  }
};

// Helper to append order to orders.json
async function appendOrderToJson(order) {
  try {
    let orders = [];
    try {
      const data = await fs.readFile(ordersJsonPath, 'utf8');
      orders = JSON.parse(data);
      if (!Array.isArray(orders)) orders = [];
    } catch (err) {
      // If file doesn't exist, start with empty array
      orders = [];
    }
    orders.push(order.toObject ? order.toObject({ virtuals: true }) : order);
    await fs.writeFile(ordersJsonPath, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Failed to append order to orders.json:', err);
  }
}

// Helper to send order confirmation email
async function sendOrderConfirmationEmail(order) {
  const { email, customerName, items, totalAmount, address } = order;
  const subject = 'Your Order Confirmation';

  // Build order items table
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.adultquantity}</td>
       <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.childquantity}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price}</td>
    </tr>
  `).join('');

  const addressHtml = `
    <div style="margin-bottom: 10px;">
      <strong>Shipping Address:</strong><br/>
      ${address.street || ''}<br/>
      ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}<br/>
      ${address.country || ''}
    </div>
  `;

const htmlBody = ` 
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #a2d4f4, #e0f7fa);">
    <div style="background-color: #ffffff; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #0288d1; margin: 0; font-size: 28px;">💦 Welcome to WaterPark Chalo! 🌊</h1>
        <p style="color: #0077b6; margin: 10px 0; font-size: 16px;">Splash. Slide. Smile. Repeat!</p>
      </div>
      <div style="margin-bottom: 25px;">
        <p style="color: #01579b; font-size: 16px; line-height: 1.6; margin: 0;">
          Hey <strong>${customerName}</strong>! 🎉
        </p>
        <p style="color: #01579b; font-size: 16px; line-height: 1.6; margin: 15px 0;">
          Thanks for booking your WaterPark adventure! 🌴 Your tickets are confirmed and here are the details:
        </p>
      </div>
      ${addressHtml}
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr>
            <th style="padding: 10px; border: 1px solid #b3e5fc; background: #e1f5fe; color: #01579b;">Pass</th>
            <th style="padding: 10px; border: 1px solid #b3e5fc; background: #e1f5fe; color: #01579b;">Adults</th>
            <th style="padding: 10px; border: 1px solid #b3e5fc; background: #e1f5fe; color: #01579b;">Kids</th>
            <th style="padding: 10px; border: 1px solid #b3e5fc; background: #e1f5fe; color: #01579b;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      <div style="text-align: right; margin-bottom: 20px; font-size: 18px; color: #0277bd;">
        <strong>Total Splash Fun: ₹${totalAmount}</strong>
      </div>
      <div style="margin: 25px 0;">
        <p style="color: #01579b; font-size: 16px; line-height: 1.6; margin: 0;">
          🌊 Get ready to dive into unlimited fun! Show this ticket at the entrance and let the water adventures begin. 🏄‍♂️
        </p>
      </div>
      <div style="border-top: 1px solid #b3e5fc; padding-top: 20px; margin-top: 30px;">
        <p style="color: #0277bd; font-size: 14px; margin: 0; line-height: 1.6;">
          <strong>See you soon at the poolside,</strong><br>
          Team WaterPark Chalo 💦
        </p>
        <div style="margin-top: 15px; color: #0277bd; font-size: 12px;">
          <p style="margin: 5px 0;">🌐 www.waterparkchalo.com</p>
          <p style="margin: 5px 0;">📩 Email: care@waterparkchalo.com</p>
        </div>
      </div>
    </div>
  </div>
`;

  const textBody = `Dear ${customerName},\n\nThank you for your order! Your order has been placed successfully.\n\nOrder Summary:\n${items.map(item => `- ${item.name} x${item.adultquantity}x${item.childquantity} (₹${item.price})`).join('\n')}\nTotal: ₹${totalAmount}\n\nShipping Address:\n${address.street || ''}\n${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}\n${address.country || ''}\n\nWe will notify you when your order is shipped.\n\nWarm regards,\nTeam waterpark chalo\nwww.waterpark chalo.com\nCare@waterpark chalo.com`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`Order confirmation email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending order confirmation email:', mailErr);
    // Don't throw, so order creation isn't blocked by email failure
  }
}

// Helper to send order status update email
async function sendOrderStatusUpdateEmail(order) {
  const { email, customerName, orderStatus, items, totalAmount, address } = order;
  const subject = `Your waterpark chalo Order Status Update: ${orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}`;

  // Build order items table
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.adultquantity}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: center;">${item.childquantity}</td>
      <td style="padding: 8px; border: 1px solid #eee; text-align: right;">₹${item.price}</td>
    </tr>
  `).join('');

  const addressHtml = `
    <div style="margin-bottom: 10px;">
      <strong>Delivery Address:</strong><br/>
      ${address.street || ''}<br/>
      ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}<br/>
      ${address.country || ''}
    </div>
  `;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0; font-size: 24px;">waterpark chalo</h1>
          <p style="color: #666; margin: 5px 0; font-size: 14px;">Where heritage meets craftsmanship</p>
        </div>
        <div style="margin-bottom: 25px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Dear <strong>${customerName}</strong>,
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            We wanted to let you know that the status of your order has been updated to:
            <span style="color: #007bff; font-weight: bold;">${orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}</span>
          </p>
        </div>
        ${addressHtml}
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Item</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">adult Qty</th>
                     <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">child Qty</th>
              <th style="padding: 8px; border: 1px solid #eee; background: #f8f9fa;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px;">
          <strong>Total: ₹${totalAmount}</strong>
        </div>
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Your order is currently <strong>${orderStatus}</strong>. We will keep you updated on the next steps. If you have any questions, feel free to reply to this email.
          </p>
        </div>
        <div style="margin: 25px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            Thank you for shopping with waterpark chalo! We hope you enjoy your purchase. Don’t forget to check out our other unique handmade products at <a href="https://www.waterpark chalo.com" style="color: #007bff;">waterpark chalo.com</a>.
          </p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 0; line-height: 1.6;">
            <strong>Warm regards,</strong><br>
            Team waterpark chalo
          </p>
          <div style="margin-top: 15px; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">🌐 www.waterpark chalo.com</p>
            <p style="margin: 5px 0;">📩 Email: Care@waterpark chalo.com</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const textBody = `Dear ${customerName},\n\nThe status of your waterpark chalo order has been updated to: ${orderStatus}.\n\nOrder Summary:\n${items.map(item => `- ${item.name} x${item.adultquantity}x${item.childquantity} (₹${item.price})`).join('\n')}\nTotal: ₹${totalAmount}\n\nDelivery Address:\n${address.street || ''}\n${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}\n${address.country || ''}\n\nThank you for shopping with waterpark chalo! Check out more at waterpark chalo.com\n\nWarm regards,\nTeam waterpark chalo\nwww.waterpark chalo.com\nCare@waterpark chalo.com`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`Order status update email sent to ${email}`);
  } catch (mailErr) {
    console.error('Error sending order status update email:', mailErr);
    // Don't throw, so status update isn't blocked by email failure
  }
}

module.exports = {
  createOrder,
  getOrdersByEmail,
  getOrderById,
  sendOrderStatusUpdateEmail,
}; 