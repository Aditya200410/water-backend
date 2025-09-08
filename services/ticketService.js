const cloudinary = require('cloudinary').v2;
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Generate ticket PDF and upload to Cloudinary
 * @param {Object} booking - The booking object
 * @returns {Object} - Contains ticketPdfUrl and cloudinaryPublicId
 */
async function generateAndUploadTicket(booking) {
  try {
    console.log('[generateAndUploadTicket] Starting ticket generation for booking:', booking.customBookingId);
    
    // Generate HTML content for the ticket
    console.log('[generateAndUploadTicket] Generating HTML content...');
    const htmlContent = generateTicketHTML(booking);
    console.log('[generateAndUploadTicket] HTML content generated, length:', htmlContent.length);
    
    let pdfBuffer;
    
    // Temporarily use only the simple PDF method due to Puppeteer issues
    console.log('[generateAndUploadTicket] Using simple PDF generation method...');
    pdfBuffer = await generateSimplePDF(booking);
    console.log('[generateAndUploadTicket] PDF generated with simple method, buffer size:', pdfBuffer.length);
    
    // Upload to Cloudinary
    console.log('[generateAndUploadTicket] Uploading to Cloudinary...');
    const uploadResult = await uploadToCloudinary(pdfBuffer, booking.customBookingId);
    console.log('[generateAndUploadTicket] Upload successful:', {
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id
    });
    
    return {
      ticketPdfUrl: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id
    };
    
  } catch (error) {
    console.error('[generateAndUploadTicket] Error:', error);
    console.error('[generateAndUploadTicket] Error stack:', error.stack);
    throw new Error(`Failed to generate ticket: ${error.message}`);
  }
}

/**
 * Generate HTML content for the ticket
 * @param {Object} booking - The booking object
 * @returns {String} - HTML content
 */
function generateTicketHTML(booking) {
  const visitDate = new Date(booking.date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const bookingDate = new Date(booking.bookingDate).toLocaleDateString('en-IN');
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Water Park Ticket - ${booking.customBookingId}</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Arial', sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 20px;
                min-height: 100vh;
            }
            
            .ticket-container {
                max-width: 400px;
                margin: 0 auto;
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                overflow: hidden;
                position: relative;
            }
            
            .ticket-header {
                background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
                color: white;
                padding: 30px 20px;
                text-align: center;
                position: relative;
            }
            
            .ticket-header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="water" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="2" fill="rgba(255,255,255,0.1)"/></pattern></defs><rect width="100" height="100" fill="url(%23water)"/></svg>');
                opacity: 0.3;
            }
            
            .waterpark-name {
                font-size: 28px;
                font-weight: bold;
                margin-bottom: 10px;
                position: relative;
                z-index: 1;
            }
            
            .ticket-subtitle {
                font-size: 16px;
                opacity: 0.9;
                position: relative;
                z-index: 1;
            }
            
            .ticket-body {
                padding: 30px 20px;
            }
            
            .booking-id {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 10px;
                text-align: center;
                margin-bottom: 25px;
                border-left: 4px solid #007bff;
            }
            
            .booking-id-label {
                font-size: 12px;
                color: #666;
                margin-bottom: 5px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .booking-id-value {
                font-size: 20px;
                font-weight: bold;
                color: #007bff;
                font-family: 'Courier New', monospace;
            }
            
            .ticket-details {
                margin-bottom: 25px;
            }
            
            .detail-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid #eee;
            }
            
            .detail-row:last-child {
                border-bottom: none;
            }
            
            .detail-label {
                font-size: 14px;
                color: #666;
                font-weight: 500;
            }
            
            .detail-value {
                font-size: 14px;
                color: #333;
                font-weight: 600;
            }
            
            .visit-date {
                background: linear-gradient(135deg, #28a745, #20c997);
                color: white;
                padding: 15px;
                border-radius: 10px;
                text-align: center;
                margin: 20px 0;
            }
            
            .visit-date-label {
                font-size: 12px;
                opacity: 0.9;
                margin-bottom: 5px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .visit-date-value {
                font-size: 18px;
                font-weight: bold;
            }
            
            .amount-section {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;
            }
            
            .amount-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            
            .amount-row:last-child {
                margin-bottom: 0;
                font-weight: bold;
                font-size: 16px;
                color: #007bff;
                border-top: 2px solid #007bff;
                padding-top: 10px;
            }
            
            .qr-section {
                text-align: center;
                margin: 25px 0;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 10px;
            }
            
            .qr-placeholder {
                width: 120px;
                height: 120px;
                background: #e9ecef;
                border: 2px dashed #adb5bd;
                border-radius: 10px;
                margin: 0 auto 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: #6c757d;
            }
            
            .ticket-footer {
                background: #f8f9fa;
                padding: 20px;
                text-align: center;
                border-top: 1px solid #eee;
            }
            
            .footer-text {
                font-size: 12px;
                color: #666;
                line-height: 1.5;
            }
            
            .water-icon {
                font-size: 24px;
                margin: 0 10px;
            }
            
            .ticket-notches {
                position: absolute;
                top: 50%;
                right: -10px;
                width: 20px;
                height: 20px;
                background: #f8f9fa;
                border-radius: 50%;
                transform: translateY(-50%);
            }
            
            .ticket-notches::before {
                content: '';
                position: absolute;
                top: 50%;
                left: -10px;
                width: 20px;
                height: 20px;
                background: #f8f9fa;
                border-radius: 50%;
                transform: translateY(-50%);
            }
        </style>
    </head>
    <body>
        <div class="ticket-container">
            <div class="ticket-header">
                <div class="waterpark-name">${booking.waterparkName}</div>
                <div class="ticket-subtitle">🎢 Water Park Adventure Ticket 💦</div>
            </div>
            
            <div class="ticket-body">
                <div class="booking-id">
                    <div class="booking-id-label">Booking ID</div>
                    <div class="booking-id-value">${booking.customBookingId}</div>
                </div>
                
                <div class="ticket-details">
                    <div class="detail-row">
                        <span class="detail-label">Customer Name</span>
                        <span class="detail-value">${booking.name}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Email</span>
                        <span class="detail-value">${booking.email}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Phone</span>
                        <span class="detail-value">${booking.phone}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Water Number</span>
                        <span class="detail-value">${booking.waternumber}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Adults</span>
                        <span class="detail-value">${booking.adults}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Children</span>
                        <span class="detail-value">${booking.children}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Booking Date</span>
                        <span class="detail-value">${bookingDate}</span>
                    </div>
                </div>
                
                <div class="visit-date">
                    <div class="visit-date-label">Visit Date</div>
                    <div class="visit-date-value">${visitDate}</div>
                </div>
                
                <div class="amount-section">
                    <div class="amount-row">
                        <span>Advance Paid</span>
                        <span>₹${booking.advanceAmount}</span>
                    </div>
                    <div class="amount-row">
                        <span>Total Amount</span>
                        <span>₹${booking.totalAmount}</span>
                    </div>
                    <div class="amount-row">
                        <span>Remaining Amount</span>
                        <span>₹${booking.leftamount}</span>
                    </div>
                </div>
                
                <div class="qr-section">
                    <div class="qr-placeholder">
                        QR Code<br>
                        ${booking.customBookingId}
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        Show this ticket at the entrance
                    </div>
                </div>
            </div>
            
            <div class="ticket-footer">
                <div class="footer-text">
                    <span class="water-icon">💦</span>
                    Thank you for choosing ${booking.waterparkName}!<span class="water-icon">💦</span><br>
                    Have a splashing good time!<br>
                    <small>Keep this ticket safe and show it at the entrance</small>
                </div>
            </div>
        </div>
        
        <div class="ticket-notches"></div>
    </body>
    </html>
  `;
}

/**
 * Generate PDF from HTML using Puppeteer
 * @param {String} htmlContent - HTML content to convert to PDF
 * @returns {Buffer} - PDF buffer
 */
async function generatePDFFromHTML(htmlContent) {
  let browser;
  
  try {
    console.log('[generatePDFFromHTML] Starting PDF generation...');
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      timeout: 60000
    });
    
    const page = await browser.newPage();
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 800 });
    
    // Set content with better error handling
    await page.setContent(htmlContent, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait a bit for any dynamic content to load
    await page.waitForTimeout(2000);
    
    // Check if page is still open
    if (page.isClosed()) {
      throw new Error('Page was closed before PDF generation');
    }
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      },
      preferCSSPageSize: true,
      timeout: 30000
    });
    
    console.log('[generatePDFFromHTML] PDF generated successfully');
    return pdfBuffer;
    
  } catch (error) {
    console.error('[generatePDFFromHTML] Error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate a simple PDF as fallback when Puppeteer fails
 * @param {Object} booking - The booking object
 * @returns {Buffer} - PDF buffer
 */
async function generateSimplePDF(booking) {
  try {
    console.log('[generateSimplePDF] Creating simple PDF for booking:', booking.customBookingId);
    
    // Create a simple text-based PDF content
    const visitDate = new Date(booking.date).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const bookingDate = new Date(booking.bookingDate).toLocaleDateString('en-IN');
    
    const pdfContent = `
%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length 500
>>
stream
BT
/F1 24 Tf
100 700 Td
(${booking.waterparkName}) Tj
0 -40 Td
/F1 12 Tf
(Booking ID: ${booking.customBookingId}) Tj
0 -20 Td
(Customer: ${booking.name}) Tj
0 -20 Td
(Email: ${booking.email}) Tj
0 -20 Td
(Phone: ${booking.phone}) Tj
0 -20 Td
(Visit Date: ${visitDate}) Tj
0 -20 Td
(Adults: ${booking.adults}, Children: ${booking.children}) Tj
0 -20 Td
(Total Amount: ₹${booking.totalAmount}) Tj
0 -20 Td
(Advance Paid: ₹${booking.advanceAmount}) Tj
0 -20 Td
(Remaining: ₹${booking.leftamount}) Tj
0 -40 Td
/F1 16 Tf
(Thank you for choosing ${booking.waterparkName}!) Tj
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000825 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
920
%%EOF
    `;
    
    return Buffer.from(pdfContent, 'utf8');
    
  } catch (error) {
    console.error('[generateSimplePDF] Error:', error);
    throw error;
  }
}

/**
 * Upload PDF buffer to Cloudinary
 * @param {Buffer} pdfBuffer - PDF buffer to upload
 * @param {String} customBookingId - Custom booking ID for naming
 * @returns {Object} - Cloudinary upload result
 */
async function uploadToCloudinary(pdfBuffer, customBookingId) {
  try {
    console.log('[uploadToCloudinary] Uploading PDF to Cloudinary...');
    
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id: `waterpark-tickets/${customBookingId}`,
          format: 'pdf',
          tags: ['ticket', 'waterpark', customBookingId],
          use_filename: false,
          unique_filename: false
        },
        (error, result) => {
          if (error) {
            console.error('[uploadToCloudinary] Error:', error);
            reject(error);
          } else {
            console.log('[uploadToCloudinary] Upload successful:', result.secure_url);
            resolve(result);
          }
        }
      );
      
      uploadStream.end(pdfBuffer);
    });
    
  } catch (error) {
    console.error('[uploadToCloudinary] Error:', error);
    throw error;
  }
}

module.exports = {
  generateAndUploadTicket
};
