const mongoose = require('mongoose');

const itinerarySchema = new mongoose.Schema({
  traveler: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Traveler', 
    required: true 
  },
  title: { type: String, required: true },
  days: [{
    day: Number,
    title: String,
    // CHANGED: activities is now an array of OBJECTS, not just strings
    activities: [{
      name: String,
      lat: Number,
      lng: Number
    }],
    image: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('Itinerary', itinerarySchema, 'itineraries');