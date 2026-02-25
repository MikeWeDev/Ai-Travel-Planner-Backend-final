const router = require('express').Router();
const Itinerary = require('../models/Itinerary');
const verifyToken = require('../middleware/verifyToken');

// 1. SAVE ITINERARY
router.post('/save', verifyToken, async (req, res) => {
  //console.log("--- POST /save TRIGGERED ---");
  //console.log("Logged-in User ID from token:", req.user ? req.user.id : "MISSING");
  //console.log("Request Body Received:", JSON.stringify(req.body, null, 2));

  try {
    const { title, days } = req.body;

    const newItinerary = new Itinerary({
      traveler: req.user.id, 
      title,
      days
    });

    const savedDoc = await newItinerary.save();
    //console.log("Successfully saved to MongoDB. Doc ID:", savedDoc._id);
    
    res.status(201).json({ message: "Itinerary saved successfully!", id: savedDoc._id });
  } catch (err) {
    console.error("SAVE ERROR:", err.message);
    res.status(500).json({ message: "Error saving itinerary", error: err.message });
  }
});

// 2. FETCH ALL ITINERARIES
router.get('/my-itineraries', verifyToken, async (req, res) => {
  //console.log("--- GET /my-itineraries TRIGGERED ---");
  //console.log("Searching for traveler ID:", req.user ? req.user.id : "UNDEFINED");

  try {
    const itineraries = await Itinerary.find({ traveler: req.user.id })
                                       .sort({ createdAt: -1 });

    //console.log(`Database query complete. Found ${itineraries.length} records.`);
    
    // This will show us if the records actually have data in them
    //console.log("First item preview:", itineraries.length > 0 ? itineraries[0].title : "NONE");

    // We explicitly send status 200 and the array
    return res.status(200).json(itineraries); 
  } catch (err) {
    console.error("FETCH ERROR:", err.message);
    // If it fails, send an empty array so frontend doesn't crash, but log the error
    return res.status(500).json([]); 
  }
});

// 3. DELETE ITINERARY
router.delete('/:id', verifyToken, async (req, res) => {
  //console.log("--- DELETE /:id TRIGGERED ---");
  //console.log("ID to delete:", req.params.id);
  //console.log("User attempting delete:", req.user.id);

  try {
    const deleted = await Itinerary.findOneAndDelete({ 
      _id: req.params.id, 
      traveler: req.user.id 
    });

    if (deleted) {
      //console.log("Delete successful for ID:", req.params.id);
      res.json({ message: "Itinerary deleted successfully" });
    } else {
      //console.log("No document found to delete with that ID/User combo.");
      res.status(404).json({ message: "Itinerary not found or unauthorized" });
    }
  } catch (err) {
    console.error("DELETE ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET a specific itinerary by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    // We search by ID AND traveler ID to ensure privacy
    const itinerary = await Itinerary.findOne({ 
      _id: req.params.id, 
      traveler: req.user.id 
    });

    if (!itinerary) {
      return res.status(404).json({ message: "Itinerary not found or access denied" });
    }

    res.status(200).json(itinerary);
  } catch (err) {
    console.error("Backend Error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;