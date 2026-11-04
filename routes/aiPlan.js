const express = require("express");
const axios = require("axios");
const router = express.Router();

// =========================================================================
// ✅ FIXED: Import the UserPreference Model and Authentication Middleware
// =========================================================================
const UserPreference = require("../models/UserPreference");
const verifyToken = require("../middleware/verifyToken");

/* ====================================================
   CONFIGURATION
===================================================== */
// 🟢 TOGGLE THIS FLAG TO SWITCH BETWEEN COHERE-ONLY AND PYTHON+COHERE
const USE_PYTHON_BACKEND = false;

// 🟢 TOGGLE THIS FLAG FOR UNSPLASH (Set to true to use Unsplash, false to use category fallbacks globally)
const USE_SPLASH = false;

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

const SUPPORTED_DATA = {
  Ethiopia: ["Addis Ababa", "Hawassa", "Bahir Dar", "Arba Minch", "Mekelle"],
};

const ALL_SUPPORTED_CITIES = Object.values(SUPPORTED_DATA).flat();

/* =====================================================
   FALLBACK LOCAL IMAGES
===================================================== */
const fallbackImagesByCategory = {
  arrival: "/images/arrival.jpg",
  culture: "/images/culture.jpg",
  adventure: "/images/adventure.jpg",
  shopping: "/images/shopping.jpg",
  food: "/images/food.jpg",
  relaxation: "/images/relaxation.webp",
  wildlife: "/images/wildlife.webp",
  history: "/images/history.jpg",
  nightlife: "/images/nightlife.jpg",
  departure: "/images/departure.jpg",
  hotel: "/images/hotel.jpg",
  museum: "/images/museum.jpg",
  nature: "/images/nature.jpg",
  sport: "/images/sport.jpg",
  historical: "/images/historical.jpg",
  community: "/images/community.jpg",
  transport: "/images/transport.webp",
  festival: "/images/festival.jpg",
  education: "/images/education.jpg",
};

// Flattened list to guarantee random-access variety if categories overlap or get repeated
const fallbackFallbackList = Object.values(fallbackImagesByCategory);

/* =====================================================
   IMAGE VALIDATION
===================================================== */
function isValidImage(url) {
  if (!url) return false;
  if (url.includes("example.com")) return false;
  if (!url.startsWith("http")) return false;
  return true;
}

/* =====================================================
   UNSPLASH IMAGE CACHE
===================================================== */
const imageCache = new Map();

/* =====================================================
   FETCH IMAGE FROM UNSPLASH
===================================================== */
async function fetchUnsplashImage(query) {
  try {
    if (!UNSPLASH_KEY) {
      console.log("⚠️ No Unsplash key → using fallback");
      return null;
    }

    if (imageCache.has(query)) {
      console.log(`⚡ Cache hit for "${query}"`);
      return imageCache.get(query);
    }

    console.log(`🌍 Unsplash search → ${query}`);

    const res = await axios.get(
      "https://api.unsplash.com/search/photos",
      {
        params: {
          query,
          per_page: 1,
          orientation: "landscape",
        },
        headers: {
          Authorization: `Client-ID ${UNSPLASH_KEY}`,
        },
      }
    );

    const imageUrl = res.data.results?.[0]?.urls?.regular || null;

    if (imageUrl) {
      imageCache.set(query, imageUrl);
    }

    return imageUrl;
  } catch (err) {
    console.log("❌ Unsplash fetch failed:", err.message);
    return null;
  }
}

/* =====================================================
   IMAGE PROCESSOR (MAIN MAGIC)
===================================================== */
async function processImages(plan, city) {
  const isSupportedCity = ALL_SUPPORTED_CITIES.includes(city);

  if (!plan.days || !Array.isArray(plan.days)) return plan;

  // Process all days concurrently using Promise.all
  await Promise.all(
    plan.days.map(async (day, i) => {
      const category = day.category?.toLowerCase() || "adventure";

      if (!isValidImage(day.image)) {
        // If USE_SPLASH is true and it's a global (unsupported) city, try fetching from Unsplash first
        if (USE_SPLASH && !isSupportedCity) {
          const searchQuery = `${category} attractions in ${city}`;
          const unsplashImage = await fetchUnsplashImage(searchQuery);

          if (unsplashImage) {
            day.image = unsplashImage;
            return;
          }
        }

        // Fallback behavior (Used when USE_SPLASH is false, for supported cities, or if Unsplash fails)
        if (fallbackImagesByCategory[category]) {
          day.image = fallbackImagesByCategory[category];
        } else {
          day.image = fallbackFallbackList[i % fallbackFallbackList.length];
        }
      }
    })
  );

  return plan;
}

/* =====================================================
   MAIN AI ENDPOINT (Updated with verifyToken Guard)
===================================================== */
router.post("/ai-plan", verifyToken, async (req, res) => {
  console.time("⏱️ Total AI-Plan Execution Time");
  try {
    const { country, city, interests, budget, duration } = req.body;

    // 1. BASIC VALIDATION
    if (!city || !duration || !budget) {
      return res.status(400).json({ message: "Missing required fields (city, duration, or budget)" });
    }

    // 2. PARSE INPUTS
    const numBudget = parseFloat(String(budget).replace(/[^0-9.]/g, "")) || 0;
    const numDuration = parseInt(duration);

    /* =====================================================
       BUDGET GUARDRAIL FEATURE
    ===================================================== */
    const MIN_DAILY_RATE = 40; 
    const totalMinRequired = MIN_DAILY_RATE * numDuration;

    if (numBudget < totalMinRequired) {
      const maxAffordableDays = Math.floor(numBudget / MIN_DAILY_RATE);
      
      console.log(`⚠️ Budget Rejected: ${numBudget} for ${numDuration} days in ${city}`);
      
      let dynamicMessage = "";
      if (maxAffordableDays >= 1) {
        dynamicMessage = `A budget of $${numBudget} is insufficient for a ${numDuration}-day trip to ${city}. To proceed, please increase your budget to $${totalMinRequired} or reduce the duration to ${maxAffordableDays} day(s).`;
      } else {
        dynamicMessage = `A total budget of $${numBudget} is below the baseline requirement for ${city}. In this region, a minimum of $${MIN_DAILY_RATE} per day is recommended to cover basic transport, food, and site fees so adject toward it.`;
      }
      
      return res.status(400).json({
        status: "REJECTED",
        reason: "INSUFFICIENT_BUDGET",
        message: dynamicMessage, 
        recommendations: {
          suggestedDuration: maxAffordableDays > 0 ? maxAffordableDays : 1,
          requiredBudget: totalMinRequired,
          dailyAverage: MIN_DAILY_RATE
        }
      });
    }

    /* =====================================================
       PROCEED WITH GENERATION (BUDGET IS OK)
    ===================================================== */
    const isSupported = ALL_SUPPORTED_CITIES.includes(city);
    let realPlaces = []; 

    // =========================================================================
    // ✅ EXTRACTION: Fetch BOTH Negative Constraints & Positive Anchors
    // =========================================================================
    let historicalComplaints = [];
    let positiveStyles = [];
    const userId = req.user ? req.user.id : null;

    if (userId) {
      console.time("⏱️ DB UserPreference Lookup");
      const userProfile = await UserPreference.findOne({ userId: userId });
      console.timeEnd("⏱️ DB UserPreference Lookup");

      if (userProfile) {
        if (userProfile.negativeConstraints) {
          historicalComplaints = userProfile.negativeConstraints.map(c => c.feedback);
        }
        if (userProfile.positiveAnchors) {
          positiveStyles = userProfile.positiveAnchors.map(a => a.feedback);
        }
      }
    }

    // 3. FETCH DATA FROM PYTHON (Only if USE_PYTHON_BACKEND flag is set to true)
    if (USE_PYTHON_BACKEND && isSupported) {
      console.log(`🤖 ROUTE A: Using Python Algorithm for ${city}`);

      const pythonPayload = {
        city: String(city),
        country: String(country || ""),
        interests: Array.isArray(interests) ? interests : [],
        budget: numBudget,
        days: numDuration,
        negative_constraints: historicalComplaints,
        positive_constraints: positiveStyles 
      };
      
      try {
        const pythonBaseUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
        console.time("⏱️ Python Backend Request");
        const pythonResponse = await axios.post(`${pythonBaseUrl}/generate`, pythonPayload);
        console.timeEnd("⏱️ Python Backend Request");
        realPlaces = pythonResponse.data.itinerary || [];
      } catch (pyErr) {
        console.error("❌ Python Server Error:", pyErr.message);
      }
    } else {
      console.log(`⚡ Cohere-Only Mode Active (Python Redirection Bypassed) for ${city}`);
    }

    // 4. PREPARE COORDINATE LOOKUP
    const coordLookup = {};
    realPlaces.forEach(day => {
      if (day.activities && Array.isArray(day.activities)) {
        day.activities.forEach(place => {
          coordLookup[place.name] = { 
            lat: place.latitude || place.lat, 
            lng: place.longitude || place.lng 
          };
        });
      }
    });

    // 5. STREAMLINED & FAST PROMPT
    const allPlaceNames = Object.keys(coordLookup).join(", ");
    const placeContext = allPlaceNames ? `Must include: ${allPlaceNames}.` : "Suggest key local attractions.";
    const exclusionsContext = historicalComplaints.length > 0 ? `DO NOT include: ${historicalComplaints.join(", ")}.` : "";
    const inclusionStylesContext = positiveStyles.length > 0 ? `Style preferences: ${positiveStyles.join(" | ")}.` : "";

    const prompt = `Create a ${numDuration}-day travel itinerary for ${city}, ${country} (Budget: $${numBudget}).
Interests: ${interests?.join(", ") || "exploration"}.
${placeContext}
${exclusionsContext}
${inclusionStylesContext}

Rules:
1. Return ONLY valid JSON (no markdown wrappers or codeblocks).
2. JSON Schema:
{
  "title": "Trip Title",
  "days": [
    {
      "day": 1,
      "category": "culture",
      "activities": [
        { "name": "Exact Spot", "lat": 0.0000, "lng": 0.0000 }
      ]
    }
  ]
}
3. Category options: [arrival, culture, adventure, shopping, food, relaxation, wildlife, history, nightlife, departure, hotel, museum, nature, sport, historical, festival].
4. Provide real decimal GPS coordinates ("lat" and "lng") for each activity.
5. Include 3 to 5 activities per day.
`;

    // 6. CALL COHERE (USING LIGHTER MODEL `command-r` FOR SPEED)
    console.time("⏱️ Cohere LLM Generation Time");
    const cohereRes = await axios.post("https://api.cohere.ai/v2/chat", {
      model: "command-r", // Changed to command-r for significantly faster inference
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1500
    }, {
      headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}` }
    });
    console.timeEnd("⏱️ Cohere LLM Generation Time");

    let reply = cohereRes?.data?.message?.content?.[0]?.text || "";
    reply = reply.replace(/```json/g, "").replace(/```/g, "").trim();

    // 7. PARSE AND ENRICH DATA
    let parsedPlan = JSON.parse(reply);

    if (parsedPlan.days) {
      parsedPlan.days = parsedPlan.days.map(day => ({
        ...day,
        activities: (day.activities || []).map(act => {
          const targetName = typeof act === "string" ? act : act.name;
          const aiLat = typeof act === "object" ? (act.lat || act.latitude || 0) : 0;
          const aiLng = typeof act === "object" ? (act.lng || act.longitude || 0) : 0;

          const pythonCoords = coordLookup[targetName];
          
          return {
            name: targetName,
            lat: pythonCoords?.lat || aiLat,
            lng: pythonCoords?.lng || aiLng
          };
        })
      }));
    }

    // 8. ADD IMAGES AND SEND TO CLIENT
    console.time("⏱️ Image Processing Time");
    parsedPlan = await processImages(parsedPlan, city);
    console.timeEnd("⏱️ Image Processing Time");

    console.timeEnd("⏱️ Total AI-Plan Execution Time");
    res.json(parsedPlan);

  } catch (err) {
    console.error("❌ AI Route Error:", err.message);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;