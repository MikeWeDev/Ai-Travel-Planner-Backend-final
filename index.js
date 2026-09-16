require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const app = express();

// ---------------- MIDDLEWARE ----------------
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Static Fallback Images
app.use("/images", express.static(path.join(__dirname, "public/images")));

// ---------------- ROUTES ----------------
app.use("/auth", require("./routes/auth"));
app.use("/api", require("./routes/aiPlan"));
app.use("/api/itineraries", require("./routes/itinerary"));

// Health Check
app.get("/", (req, res) => {
  res.send("✅ Backend is live!");
});

// ---------------- GLOBAL ERROR HANDLER ----------------
// Prevents unhandled async crashes from hanging responses
app.use((err, req, res, next) => {
  console.error("🔥 Global Error Handler Caught:", err.stack);
  res.status(500).json({ message: "An internal server error occurred." });
});

// ---------------- SERVER START ----------------
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout fast if DB is down instead of hanging
  })
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1); // Exit process so hosting service (Render/Heroku/PM2) can restart it
  });