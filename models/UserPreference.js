const mongoose = require('mongoose');

const UserPreferenceSchema = new mongoose.Schema({
  userId: {
    type: String, // Matches req.user.id layout format
    required: true,
    unique: true
  },
  // Continuous array tracking all historical structural faults pointed out by the user
  negativeConstraints: [
    {
      title: { type: String },       // Name of the trip context
      feedback: { type: String },    // Why they rejected it
      timestamp: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

positiveAnchors: [{
    title: String,
    feedback: String, 
    rating: Number,
    createdAt: { type: Date, default: Date.now }
  }]
  
module.exports = mongoose.model('UserPreference', UserPreferenceSchema);