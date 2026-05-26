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
    activities: [{
      name: String,
      lat: Number,
      lng: Number
    }],
    image: String
  }],
  // ✅ ADDED FOR INDEPENDENT RATING PIPELINE SUPPORT
  rating: { 
    type: Number, 
    min: 1, 
    max: 5, 
    default: null 
  },
  ratingComment: { 
    type: String, 
    default: "" 
  }
}, { timestamps: true });

module.exports = mongoose.model('Itinerary', itinerarySchema, 'itineraries');