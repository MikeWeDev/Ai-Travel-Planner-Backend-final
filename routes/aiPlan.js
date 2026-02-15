const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post("/ai-plan", async (req, res) => {
  try {
    const {
      country,
      city,
      departureDate,
      returnDate,
      tripType,
      interests,
      budget,
      duration,
    } = req.body;

    // Basic validation
    if (!country || !city || !departureDate || !returnDate || !duration) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Build natural language prompt
    const prompt = `
You are a professional travel planner. Generate a ${duration}-day travel itinerary for a ${tripType || "traveler"} visiting ${city}, ${country}.
Their interests include: ${interests?.join(", ") || "general sightseeing"}.
Their budget is ${budget || "moderate"}.
Dates: ${new Date(departureDate).toDateString()} to ${new Date(returnDate).toDateString()}.

Respond in this JSON format:

{
  "title": "Trip to Tokyo for 7 Days",
  "days": [
    {
      "day": 1,
      "title": "Arrival and Local Cuisine",
      "activities": [
        "Arrive and check-in at hotel",
        "Visit a local market",
        "Dinner at a traditional Japanese izakaya"
      ]
    },
    ...
  ]
}
`;

    // OpenAI API call
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // or "gpt-4"
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    // Try to extract JSON safely
    const response = completion.choices[0]?.message?.content?.trim();
    const parsed = JSON.parse(response);

    res.json(parsed);
  } catch (err) {
    console.error("AI generation failed:", err);

    if (err.name === "SyntaxError") {
      return res.status(500).json({ message: "Failed to parse AI response" });
    }

    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
