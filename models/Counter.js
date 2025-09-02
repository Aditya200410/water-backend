const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    // This _id will be the name of the park, e.g., "BlueLagoon"
    _id: { 
        type: String, 
        required: true 
    },
    // This is the last booking number used for that park
    sequence_value: { 
        type: Number, 
        default: 0 
    }
});

module.exports = mongoose.model('Counter', counterSchema);