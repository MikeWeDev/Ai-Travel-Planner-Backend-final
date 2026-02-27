const express = require("express");

const axios = require("axios");

const router = express.Router();

/* =====================================================
   CONFIGURATION
===================================================== */

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

const SUPPORTED_DATA = {
  Ethiopia: ["Addis Ababa", "Hawassa", "Bahir Dar", "Arba Minch", "Mekelle"],
  Kenya: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
  "United Kingdom": ["London", "Edinburgh", "Manchester", "Birmingham", "Glasgow"],
  France: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice"],
  Japan: ["Tokyo", "Kyoto", "Osaka", "Sapporo", "Fukuoka"],
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

/* =====================================================
   DEBUG HELPERS
===================================================== */

function logImage(stage, day) {
  //console.log( `🖼 [${stage}] Day ${day.day} | category=${day.category} | image=${day.image}` );
}

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
    console.log("❌ Unsplash fetch failed");
    return null;
  }
}

/* =====================================================
   IMAGE PROCESSOR (MAIN MAGIC)
===================================================== */

async function processImages(plan, city) {
  for (const day of plan.days) {
    // 1. Ensure a category exists, otherwise default to 'adventure'
    const category = day.category?.toLowerCase() || "adventure";

    if (!isValidImage(day.image)) {
      // 2. Use the city and category for a specific search
      const searchQuery = `${category} attractions in ${city}`;

      const unsplashImage = await fetchUnsplashImage(searchQuery);

      if (unsplashImage) {
        day.image = unsplashImage;
      } else {
        // 3. Fallback to your local images
        day.image = fallbackImagesByCategory[category] || fallbackImagesByCategory.adventure;
      }
    }
  }
  return plan;
}

/* =====================================================
   MAIN AI ENDPOINT (Updated for Coordinates)
===================================================== */
router.post("/ai-plan", async (req, res) => {
  try {
    const { country, city, interests, budget, duration } = req.body;

    if (!city || !duration) {
      return res.status(400).json({ message: "Missing city or duration" });
    }

    const isSupported = ALL_SUPPORTED_CITIES.includes(city);
    let realPlaces = []; // This will hold the daily itinerary from Python
    let sourceNote = "";

    // 1. FETCH DATA FROM PYTHON (If supported)
    if (isSupported) {
      console.log(`🤖 ROUTE A: Using Python Algorithm`);
      sourceNote = "Algorithmically Optimized (Verified PostgreSQL Data)";
      const pythonPayload = {
        city: String(city),
        country: String(country || ""),
        interests: Array.isArray(interests) ? interests : [],
        budget: parseFloat(String(budget).replace(/[^0-9.]/g, "")) || 500,
        days: parseInt(duration),
      };
      
      try {
        const pythonBaseUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
        const pythonResponse = await axios.post(`${pythonBaseUrl}/generate`, pythonPayload);
        realPlaces = pythonResponse.data.itinerary || [];
      } catch (pyErr) {
        console.error("❌ Python Server Error:", pyErr.message);
      }
    }

    // 2. PREPARE COORDINATE LOOKUP
    // We create a map so we can find coordinates by name later
    const coordLookup = {};
    realPlaces.forEach(day => {
      day.activities.forEach(place => {
        coordLookup[place.name] = { 
          lat: place.latitude, 
          lng: place.longitude 
        };
      });
    });

    // 3. PREPARE PROMPT FOR COHERE
    const allPlaceNames = Object.keys(coordLookup).join(", ");
    const placeContext = allPlaceNames.length > 0 
      ? `Mandatory Locations to include: ${allPlaceNames}.` 
      : "Suggested Locations: Recommend best local spots.";

    const prompt = `
      Task: Create a professional ${duration}-day travel itinerary for ${city}, ${country}.
      ${placeContext}
      User Interests: ${interests?.join(", ") || "general exploration"}.
      Instructions:
      1. Return ONLY raw JSON. No markdown.
      2. Format: { "title": "...", "days": [ { "day": 1, "activities": ["Name1", "Name2"], "category": "..." } ] }
    `;

    // 4. CALL COHERE
    const cohereRes = await axios.post("https://api.cohere.ai/v2/chat", {
      model: "command-r-plus-08-2024",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }, {
      headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}` }
    });

    let reply = cohereRes?.data?.message?.content?.[0]?.text || "";
    reply = reply.replace(/```json/g, "").replace(/```/g, "").trim();

    // 5. PARSE AND ENRICH DATA (THE KEY STEP)
    let parsedPlan = JSON.parse(reply);

    if (parsedPlan.days) {
      parsedPlan.days = parsedPlan.days.map(day => ({
        ...day,
        activities: day.activities.map(actName => {
          // Find the coordinates from our Python lookup
          const coords = coordLookup[actName] || { lat: 0, lng: 0 };
          return {
            name: actName,
            lat: coords.lat,
            lng: coords.lng
          };
        })
      }));
    }

    // 6. ADD IMAGES AND SEND TO CLIENT
    parsedPlan = await processImages(parsedPlan, city);
    res.json(parsedPlan);

  } catch (err) {
    console.error("❌ AI Route Error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});
module.exports = router;