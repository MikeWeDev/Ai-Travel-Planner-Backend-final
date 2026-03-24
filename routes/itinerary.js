const router = require('express').Router();
const Itinerary = require('../models/Itinerary');
const verifyToken = require('../middleware/verifyToken');

// 1. SAVE ITINERARY (Updated with internal validation)
router.post('/save', verifyToken, async (req, res) => {
  try {
    const { title, days } = req.body;

    // Optional: Defensive check to ensure data quality
    if (!days || !Array.isArray(days)) {
      return res.status(400).json({ message: "Invalid itinerary data" });
    }

    const newItinerary = new Itinerary({
      traveler: req.user.id, 
      title,
      days // Mongoose will automatically map the {name, lat, lng} objects here
    });

    const savedDoc = await newItinerary.save();
    res.status(201).json({ 
      message: "Itinerary saved successfully!", 
      id: savedDoc._id 
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

module.exports = router;
