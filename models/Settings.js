const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed, // Use Mixed type to store objects
    required: true,
  },
  description: {
    type: String,
    trim: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingSchema);