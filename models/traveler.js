const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  refreshToken: { type: String },
  
}, { timestamps: true });

module.exports = mongoose.model(
  'Traveler', // model name (used in code)
  userSchema,
  'traveler'  // EXACT MongoDB collection name
);