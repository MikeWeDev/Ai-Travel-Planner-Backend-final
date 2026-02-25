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

        //console.log("🪵 Using local fallback →", fallback);
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

    const prompt = `
Create a ${duration}-day travel itinerary for ${city}, ${country}.

Return ONLY JSON:
{
"title":"Trip",
"days":[
{
"day":1,
"title":"Title",
"activities":["A","B","C"],
"category":"nature",
"image":""
}
]
}
`;

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

    let reply = cohereRes.data.message.content[0].text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    //console.log("📥 Raw AI response received");

    let parsedPlan = JSON.parse(reply);

    parsedPlan.days.forEach((d) => logImage("AI OUTPUT", d));

    parsedPlan = await processImages(parsedPlan, city);

    //console.log("📤 Sending itinerary");

    parsedPlan.days.forEach((d) => logImage("FINAL", d));

    res.json(parsedPlan);
  } catch (err) {
    console.error("❌ AI Route Error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;