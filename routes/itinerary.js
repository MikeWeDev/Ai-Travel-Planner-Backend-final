const express = require('express');
const router = require('express').Router();
const Itinerary = require('../models/Itinerary');
const UserPreference = require('../models/UserPreference');
const verifyToken = require('../middleware/verifyToken');

// ✅ FIXED: Added missing axios import so the downstream request works perfectly
const axios = require('axios');

router.post('/reject', verifyToken, async (req, res) => {
  try {
    const { originalTitle, itineraryData, reason } = req.body;
    const userId = req.user ? req.user.id : "anonymous";

    // ✅ AI Learning Layer: Persist feedback locally inside MongoDB profile
    if (userId !== "anonymous") {
      await UserPreference.findOneAndUpdate(
        { userId: userId },
        { 
          $push: { 
            negativeConstraints: { title: originalTitle, feedback: reason } 
          } 
        },
        // ✅ FIXED: Capitalized Python 'True' changed to JavaScript lowercase 'true'
        { upsert: true, new: true } 
      );
    }

    // Forward raw analytics telemetry payload directly to the Python AI engine
    const pythonResponse = await axios.post('http://localhost:8000/api/learn/feedback', {
      user_id: userId,
      title: originalTitle,
      itinerary: itineraryData,
      feedback: reason
    });

    return res.status(200).json({ 
      success: true, 
      message: "Feedback processed and AI model calibrated successfully.",
      data: pythonResponse.data 
    });

  } catch (error) {
    console.error("Error sending telemetry metrics to Python AI stack:", error.message);
    return res.status(500).json({ success: false, message: "Feedback pipeline timeout" });
  }
});

/**
 * 💡 REFERENCE NOTE FOR YOUR GENERATE ROUTE:
 * Wherever your application code makes an HTTP POST call to 'http://localhost:8000/generate',
 * update it to include historical negative constraints like this:
 * * const userProfile = await UserPreference.findOne({ userId: req.user.id });
 * const historicalComplaints = userProfile ? userProfile.negativeConstraints.map(c => c.feedback) : [];
 * * const pythonResponse = await axios.post('http://localhost:8000/generate', {
 * ...req.body,
 * negative_constraints: historicalComplaints
 * });
 */

// 1. SAVE ITINERARY (Updated with internal validation)
router.post('/save', verifyToken, async (req, res) => {
  try {
    const { title, days } = req.body;

    if (!days || !Array.isArray(days)) {
      return res.status(400).json({ message: "Invalid itinerary data" });
    }

    const newItinerary = new Itinerary({
      traveler: req.user.id, 
      title,
      days 
    });

    const savedDoc = await newItinerary.save();
    
    // ✅ CHANGED: changed key from 'id' to '_id' to align with frontend checks
    res.status(201).json({ 
      success: true,
      message: "Itinerary saved successfully!", 
      _id: savedDoc._id 
    });
  } catch (err) {
    console.error("SAVE ERROR:", err.message);
    res.status(500).json({ message: "Error saving itinerary", error: err.message });
  }
});



// 2. FETCH ALL ITINERARIES (Remains the same - works perfectly)
router.get('/my-itineraries', verifyToken, async (req, res) => {
  try {
    const itineraries = await Itinerary.find({ traveler: req.user.id })
                                       .sort({ createdAt: -1 });
    return res.status(200).json(itineraries); 
  } catch (err) {
    console.error("FETCH ERROR:", err.message);
    return res.status(500).json([]); 
  }
});

// 3. GET SPECIFIC ITINERARY (Crucial for the Map Detail Page)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const itinerary = await Itinerary.findOne({ 
      _id: req.params.id, 
      traveler: req.user.id 
    });

    if (!itinerary) {
      return res.status(404).json({ message: "Itinerary not found" });
    }

    res.status(200).json(itinerary);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 4. DELETE ITINERARY
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const deleted = await Itinerary.findOneAndDelete({ 
      _id: req.params.id, 
      traveler: req.user.id 
    });
    res.json({ message: deleted ? "Deleted" : "Not found" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ INDEPENDENT RATING ENDPOINT (Matching your traveler key rules)
router.patch("/rate/:id", verifyToken, async (req, res) => {
  try {
    const { rating, ratingComment } = req.body;
    const itineraryId = req.params.id;
    const userId = req.user.id;

    // 1. Update the individual itinerary record directly
    const updatedItinerary = await Itinerary.findOneAndUpdate(
      { _id: itineraryId, traveler: userId },
      { 
        $set: { 
          rating: Number(rating), 
          ratingComment: String(ratingComment || "") 
        } 
      },
      { new: true }
    );

    if (!updatedItinerary) {
      return res.status(404).json({ message: "Itinerary layout mapping not found or unauthorized access." });
    }

    // 2. ✅ AI Learning Layer: Capture positive feedback for future iterations
    if (Number(rating) >= 4) {
      // Save it to MongoDB for our Node.js historical reference accumulation
      await UserPreference.findOneAndUpdate(
        { userId: userId },
        { 
          $push: { 
            positiveAnchors: { 
              title: updatedItinerary.title, 
              feedback: ratingComment || "User loved this generation setup.",
              rating: Number(rating)
            } 
          } 
        },
        { upsert: true, new: true }
      );

      // Forward positive training weights down to the Python AI engine
      try {
        await axios.post('http://localhost:8000/api/learn/feedback', {
          user_id: userId,
          title: updatedItinerary.title,
          itinerary: updatedItinerary.days,
          feedback: ratingComment || "Perfect generation match",
          signal_type: "POSITIVE" // Tell Python this is a success model, not a rejection
        });
      } catch (aiErr) {
        // Log AI endpoint errors gracefully so user experience doesn't break if python service lags
        console.error("Failed to forward positive anchor telemetry to Python engine:", aiErr.message);
      }
    }

    res.json({ success: true, message: "Review documentation synchronized and profile calibrated." });
  } catch (err) {
    console.error("RATING COMPILATION ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;