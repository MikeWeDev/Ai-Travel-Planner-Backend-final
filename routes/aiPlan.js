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
  //console.log("🧩 processImages() started");

  for (const day of plan.days) {
    logImage("BEFORE", day);

    if (!isValidImage(day.image)) {
      const searchQuery = `${day.category} ${city} travel`;

      const unsplashImage = await fetchUnsplashImage(searchQuery);

      if (unsplashImage) {
        console.log("✅ Unsplash image assigned");
        day.image = unsplashImage;
      } else {
        const fallback =
          fallbackImagesByCategory[day.category] ||
          fallbackImagesByCategory.adventure;

        console.log("🪵 Using local fallback →", fallback);
        day.image = fallback;
      }
    }

    logImage("AFTER", day);
  }

  console.log("✅ Image processing finished");
  return plan;
}

/* =====================================================
   MAIN AI ENDPOINT
===================================================== */
router.post("/ai-plan", async (req, res) => {
  try {
    const { country, city, interests, budget, duration } = req.body;

    if (!city || !duration) {
      return res.status(400).json({ message: "Missing city or duration" });
    }

    const isSupported = ALL_SUPPORTED_CITIES.includes(city);
    let realPlaces = [];
    let sourceNote = "";

    if (isSupported) {
      console.log(`🤖 ROUTE A: Using Python Algorithm (postgress  Data Found)`);
      sourceNote = "Algorithmically Optimized (Verified postgress  Data)";
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
        console.log(`✅ Python found ${realPlaces.length} real locations.`);
      } catch (pyErr) {
        console.error("❌ Python Server Error:", pyErr.response?.data?.detail || pyErr.message);
        // Continue to Cohere if Python fails
      }
    } else {
      console.log(`🌍 ROUTE B: Using Global AI Knowledge (Not in postgress )`);
      sourceNote = "General AI Knowledge (Global Search)";
    }

    // Prepare Cohere prompt
    const placeNames =
      realPlaces.length > 0 ? realPlaces.map((p) => p.name).join(", ") : "top local landmarks and authentic hidden gems";

    const prompt = `
Task: Create a professional ${duration}-day travel itinerary for ${city}, ${country}.
Source Type: This itinerary is ${sourceNote}.
${
  realPlaces.length > 0
    ? `Mandatory Locations to include: ${placeNames}. Use ONLY these names for the main activities.`
    : "Suggested Locations: Please suggest the best real-world attractions for this city."
}
User Interests: ${interests?.join(", ") || "general exploration"}.
Instructions:
1. Organize the itinerary logically by day.
2. For each day, provide a title and 3 distinct activities.
3. Assign one category (culture, nature, food, adventure, history, or relaxation) per day.
Return ONLY raw JSON. No markdown backticks, no explanations.
{
  "title": "Unforgettable trip to ${city}",
  "dataSource": "${sourceNote}",
  "days": [
    {
      "day": 1,
      "title": "Day Title",
      "activities": ["Activity 1", "Activity 2", "Activity 3"],
      "category": "culture",
      "image": ""
    }
  ]
}
`;

    // Call Cohere AI
    console.log("✍️ Step 2: Narrating with Cohere AI...");
    const cohereRes = await axios.post(
      "https://api.cohere.ai/v2/chat",
      {
        model: "command-r-plus-08-2024",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let reply = cohereRes?.data?.message?.content?.[0]?.text || "";
    reply = reply.replace(/```json/g, "").replace(/```/g, "").trim();

   let parsedPlan;
try {
  parsedPlan = JSON.parse(reply);

  // -------------------------------
  // STEP: ASSIGN SPLASH IMAGE OR FALLBACK
  // -------------------------------
  parsedPlan = await processImages(parsedPlan, city);

} catch (parseErr) {
  console.error("⚠️ AI JSON Parse failed. Content was:", reply);
  parsedPlan = generateDummyItinerary(city, duration);
}

res.json(parsedPlan);
  } catch (err) {
    console.error("❌ AI Route Error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;