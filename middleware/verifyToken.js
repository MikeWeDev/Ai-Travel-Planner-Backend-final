// middleware/verifyToken.js
const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  //console.log("\n--- [START] VERIFY TOKEN MIDDLEWARE ---");
  
  const authHeader = req.headers["authorization"];
  //console.log("Raw Authorization Header:", authHeader);

  if (!authHeader) {
    //console.error("❌ ERROR: No Authorization header found in request.");
    return res.status(401).json({ message: "Access token missing (No Header)" });
  }

  const token = authHeader.split(" ")[1];
  //console.log("Extracted Token String:", token ? `${token.substring(0, 10)}...` : "UNDEFINED");

  if (!token) {
    //console.error("❌ ERROR: Header found but Token part is missing (Check 'Bearer ' prefix).");
    return res.status(401).json({ message: "Access token missing (Malformed Header)" });
  }

  // Using the same secret used in your login route
  const secret = process.env.JWT_SECRET || "fallback_secret";
  //console.log("Using JWT_SECRET:", secret === "fallback_secret" ? "⚠️ WARNING: Using Fallback" : "✅ Loaded from .env");

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      //console.error("❌ JWT VERIFY ERROR:", err.name, "-", err.message);
      
      // If the error is 'TokenExpiredError', we know the user just needs to log in again
      // If it is 'JsonWebTokenError', the secret key is likely different between Login and Verify
      return res.status(401).json({ 
        message: "Invalid or expired token", 
        errorType: err.name,
        details: err.message 
      });
    }

    //console.log("✅ TOKEN VALID. Decoded Payload:", JSON.stringify(decoded));
    
    // IMPORTANT: Make sure your login route signed the token with { id: user._id }
    // If decoded has ._id but your code expects .id, this causes problems later
    req.user = decoded; 
    
    //console.log("Assigned req.user:", req.user);
    //console.log("--- [END] VERIFY TOKEN MIDDLEWARE ---\n");
    next();
  });
};

module.exports = verifyToken;