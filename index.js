require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const app = express();

// ---------------- MIDDLEWARE ----------------
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));app.use(express.json());


app.use(cookieParser());
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("Mongo error:", err));

// fallback images stay here (GOOD PRACTICE)
app.use("/images", express.static(path.join(__dirname, "public/images")));

// ---------------- ROUTES ----------------
app.use("/auth", require("./routes/auth"));     // your existing auth
app.use("/api", require("./routes/aiPlan"));   // AI itinerary routes

// ---------------- HEALTH CHECK ----------------
app.get("/", (req, res) => {
  res.send("✅ Backend is live!");
});



// ---------------- SERVER START ----------------
const PORT = process.env.PORT || 5000;


app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});