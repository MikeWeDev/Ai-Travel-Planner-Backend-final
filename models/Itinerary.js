const mongoose = require('mongoose');

const itinerarySchema = new mongoose.Schema({
  // Reference to the Traveler model
  traveler: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Traveler', 
    required: true 
  },
  title: { type: String, required: true },
  days: [{
    day: Number,
    title: String,
    activities: [String],
    image: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('Itinerary', itinerarySchema, 'itineraries');