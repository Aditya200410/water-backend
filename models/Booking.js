const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({

  customBookingId: {
    type: String,
    unique: true, // Ensures every booking ID is unique
    required: true,
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false // Make this optional for guest bookings
  },
  waterpark: { type: mongoose.Schema.Types.ObjectId, ref: "Waterpark" },
  waterparkName: String,
  paymentType: String, // Product payment type: 'advance' or 'full'
  paymentMethod: String, // Payment method: 'razorpay', 'cash', etc.
  name: { type: String, required: true }, // Ensure name is required
  email: { type: String, required: true }, // Ensure email is required
  phone: { type: String, required: true }, // Ensure phone is required
  date: { type: Date, required: true },
  bookingDate: { type: Date, default: Date.now }, // Set default to current date
  adults: { type: Number, default: 0 }, // Default to 0 if not provided
  children: { type: Number, default: 0 }, // Default to 0 if not provided
  waternumber: { type: String, required: true },

  advanceAmount: { type: Number, required: true }, // Total price is mandatory
  paymentId: String,
  razorpayOrderId: String, // Store Razorpay order ID for webhook lookup (legacy)
  phonepeOrderId: String, // Store PhonePe order ID (transaction ID)
  phonepeMerchantOrderId: String, // Store PhonePe merchant order ID
  paymentStatus: { type: String, default: "Pending" },

  totalAmount: { type: Number, required: true, default: 0 }, // Total price is mandatory
  terms: { type: String, required: false },
  leftamount: { type: Number, required: true }, // Amount left to pay
});

module.exports = mongoose.model("Booking", bookingSchema);

// ✅ Security: Prevent any changes to core fields once booking is "Completed"
bookingSchema.pre('save', function (next) {
  // If this is a new document, allow it
  if (this.isNew) return next();

  // If the document was ALREADY completed before this save
  if (this._originalStatus === "Completed") {
    const coreFields = ['customBookingId', 'waterpark', 'name', 'email', 'phone', 'date', 'adults', 'children', 'totalAmount', 'advanceAmount', 'leftamount'];

    const modifiedFields = coreFields.filter(field => this.isModified(field));

    if (modifiedFields.length > 0) {
      console.warn(`[Security] Blocked attempt to modify core fields on completed booking: ${this.customBookingId}`);
      const err = new Error(`Security Violation: Cannot modify core fields (${modifiedFields.join(', ')}) after ticket is generated.`);
      return next(err);
    }
  }
  next();
});

// Store original status to check in pre-save
bookingSchema.post('init', function () {
  this._originalStatus = this.paymentStatus;
});
