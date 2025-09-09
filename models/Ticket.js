
const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
    unique: true
  },
  customBookingId: {
    type: String,
    required: true,
    unique: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["generated", "sent", "downloaded"],
    default: "generated"
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloadedAt: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model("Ticket", ticketSchema);
