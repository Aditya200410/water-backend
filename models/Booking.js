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
  paymentType: String,
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
  paymentStatus: { type: String, default: "Pending" },
  
  totalAmount : { type: Number, required: true ,default: 0}, // Total price is mandatory
terms:{type:String,required:false},
  leftamount: { type: Number, required:true }, // Amount left to pay
});

module.exports = mongoose.model("Booking", bookingSchema);
