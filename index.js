require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION: YOUR SUPPORTED DATABASE ---
// This must match your Step1.tsx exactly for the Python split to work
const SUPPORTED_DATA = {
    "Ethiopia": ["Addis Ababa", "Hawassa", "Bahir Dar", "Arba Minch", "Mekelle"],
    "Kenya": ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
    "United Kingdom": ["London", "Edinburgh", "Manchester", "Birmingham", "Glasgow"],
    "France": ["Paris", "Marseille", "Lyon", "Toulouse", "Nice"],
    "Japan": ["Tokyo", "Kyoto", "Osaka", "Sapporo", "Fukuoka"]
};

// Flatten cities into a single list for easy checking
const ALL_SUPPORTED_CITIES = Object.values(SUPPORTED_DATA).flat();

// Serve static images from public/images folder
app.use("/images", express.static(path.join(__dirname, "public/images")));

// Map categories to local image paths
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

// Helper: Add fallback images based on category
function addFallbackImages(plan) {
    if (!plan.days || !Array.isArray(plan.days)) return plan;
    plan.days = plan.days.map((day) => {
        if (!day.image || day.image.trim() === "") {
            const fallbackImage = fallbackImagesByCategory[day.category] || fallbackImagesByCategory["adventure"];
            day.image = fallbackImage;
        }
        return day;
    });
    return plan;
}

// Helper: Dummy data if everything fails
function generateDummyItinerary(city, duration) {
    const sampleDays = [
        { day: 1, title: "Arrival", activities: ["Check-in", "Local dinner"], category: "arrival" },
        { day: 2, title: "Exploration", activities: ["City tour", "Museum"], category: "culture" }
    ];
    const days = [];
    for (let i = 0; i < duration; i++) {
        const base = sampleDays[i % sampleDays.length];
        days.push({ ...base, day: i + 1, image: fallbackImagesByCategory[base.category] || "/images/adventure.jpg" });
    }
    return { title: `Trip to ${city}`, days };
}

app.get("/", (req, res) => res.send("✅ Backend is live!"));

// --- MAIN ROUTE: THE BRIDGE ---
app.post("/api/ai-plan", async (req, res) => {
    try {
        const { country, city, interests, budget, duration } = req.body;

        // Basic validation
        if (!city || !duration) {
            return res.status(400).json({ message: "Missing city or duration" });
        }

        // 1. VALIDATION FOR "OTHER" (GLOBAL) INPUTS
        // We check if the city is in our list. If not, we ask Cohere if it's even a real place.
        const isSupported = ALL_SUPPORTED_CITIES.includes(city);
        
        if (!isSupported) {
            console.log(`🔍 Checking if "${city}" is a valid global destination...`);
            try {
                const validationCheck = await axios.post(
                    "https://api.cohere.ai/v2/chat",
                    {
                        model: "command-r-plus-08-2024",
                        messages: [{ 
                            role: "user", 
                            content: `Is "${city}" a real, well-known city or tourist destination in "${country}"? Answer only with the word "YES" or "NO".` 
                        }],
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
                            "Content-Type": "application/json",
                        },
                    }
                );

                const validationReply = validationCheck.data?.message?.content?.[0]?.text?.toUpperCase();
                
                if (validationReply.includes("NO")) {
                    console.warn(`🚫 Invalid destination blocked: ${city}`);
                    return res.status(400).json({ 
                        message: `The destination "${city}" in ${country} appears to be invalid or unsupported. Please check your spelling or choose a supported city.` 
                    });
                }
            } catch (valErr) {
                console.error("Validation API error, bypassing to be safe.");
            }
        }

        // 2. SPLIT WORK: PYTHON vs COHERE
        let realPlaces = [];
        let sourceNote = "";

        if (isSupported) {
            console.log("🤖 ROUTE A: Using Python Algorithm (CSV Data Found)");
            sourceNote = "Algorithmically Optimized (Verified CSV Data)";
            
            const pythonPayload = {
                city: String(city),
                country: String(country || ""),
                interests: Array.isArray(interests) ? interests : [],
                budget: parseFloat(String(budget).replace(/[^0-9.]/g, '')) || 500,
                duration: parseInt(duration) 
            };

            try {
                const pythonResponse = await axios.post("http://localhost:8000/generate", pythonPayload);
                realPlaces = pythonResponse.data.itinerary || [];
                console.log(`✅ Python found ${realPlaces.length} real locations.`);
            } catch (pyErr) {
                console.error("❌ Python Server Error:", pyErr.response?.data?.detail || pyErr.message);
                // Continue to Cohere if Python fails
            }
        } else {
            console.log("🌍 ROUTE B: Using Global AI Knowledge (Not in CSV)");
            sourceNote = "General AI Knowledge (Global Search)";
        }

        // 3. PREPARE PROMPT FOR COHERE
        const placeNames = realPlaces.length > 0 
            ? realPlaces.map(p => p.name).join(", ") 
            : "top local landmarks and authentic hidden gems";

        const prompt = `
            Task: Create a professional ${duration}-day travel itinerary for ${city}, ${country}.
            Source Type: This itinerary is ${sourceNote}.
            
            ${realPlaces.length > 0 
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

        // 4. TALK TO COHERE AI
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

        let reply = cohereRes?.data?.message?.content?.[0]?.text;
        
        // Clean the reply just in case Cohere adds markdown backticks
        reply = reply.replace(/```json/g, "").replace(/```/g, "").trim();

        // 5. PARSE AND ENRICH
        let parsedPlan;
        try {
            parsedPlan = JSON.parse(reply);
            parsedPlan = addFallbackImages(parsedPlan);
        } catch (parseErr) {
            console.error("⚠️ AI JSON Parse failed. Content was:", reply);
            parsedPlan = generateDummyItinerary(city, duration);
        }

        // Send final plan back to frontend
        res.json(parsedPlan);

    } catch (err) {
        console.error("❌ Critical Route Error:", err.message);
        res.status(500).json({ message: "Internal server error. Please try again later." });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));