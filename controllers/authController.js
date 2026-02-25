const User2 = require("../models/traveler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// @route POST /auth/register
const register = async (req, res) => {
  const { name, email, password } = req.body; // include 

  try {
    // 1. Check if email already exists
    const userExists = await User2.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Create user  
    const user = await User2.create({
      name,
      email,
      password: hashedPassword,
    });

    // 4. Return safe response
    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
   // console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// @route POST /auth/login
const login = async (req, res) => {
    // --- DEBUG 1: Log incoming request data ---
   // console.log("--- Login Attempt Started ---");
   // console.log("Received data:", req.body); 

    const { email, password } = req.body;
    
    // Check if email or password are missing from the request body
    if (!email || !password) {
       // console.log("DEBUG 1.1: Missing email or password in request body.");
        return res.status(400).json({ message: "Email and password are required" });
    }

    try {
        // --- DEBUG 2: Attempt to find user by email ---
        const user = await User2.findOne({ email });
        
        if (!user) {
           // console.log(`DEBUG 2.1: User not found for email: ${email}`);
            // Changed status to 401 Unauthorized (standard for failed login)
            return res.status(401).json({ message: "Invalid credentials: User not found" });
        }
        
       // console.log("DEBUG 2.3: DB Hashed Password (First 10 chars):", user.password.substring(0, 10) + '...');


        // --- DEBUG 3: Compare password with hash ---
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
           // console.log("DEBUG 3.1: Password mismatch detected.");
            // Changed status to 401 Unauthorized (standard for failed login)
            return res.status(401).json({ message: "Invalid credentials: Password incorrect" });
        }
        
  

        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET || 'fallback_secret', 
            { expiresIn: "1h" }
        );
        
    
      const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
    { expiresIn: "7d" }
);


    user.refreshToken = refreshToken;
     await user.save();

     res.cookie("refreshToken", refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // HTTPS only in prod
  sameSite: "Strict", // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
});



        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            },
        });

    } catch (err) {
        // --- DEBUG 6: Server Error Catch ---
       // console.error("DEBUG 6.1: Catastrophic Login error:", err);
        res.status(500).json({ message: "Server error" });
    } finally {
       // console.log("--- Login Attempt Ended ---");
    }
};

// @route GET /auth/refresh
const refreshToken = async (req, res) => {
  try {
    // 1. Read the refresh token from cookie
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: "No refresh token found" });

    // 2. Verify the refresh token
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret');

    // 3. Find the user in DB
    const user = await User2.findById(payload.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // 4. Generate new access token
    const newAccessToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: "1h" }
    );

    // 5. Optionally: generate a new refresh token to rotate (more secure)
    const newRefreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
      { expiresIn: "7d" }
    );

    // 6. Save the new refresh token to DB and cookie
    user.refreshToken = newRefreshToken;
    await user.save();

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // 7. Send new access token to frontend
    res.status(200).json({ token: newAccessToken });

  } catch (err) {
   // console.error("Refresh token error:", err);
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
};

const me = async (req, res) => {
  try {
    const user = await User2.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

const logout = async (req, res) => {
  res.clearCookie("refreshToken", { httpOnly: true, sameSite: "Strict", secure: process.env.NODE_ENV === "production" });
  res.status(200).json({ message: "Logged out successfully" });
};


module.exports = { register, login,refreshToken ,me,logout};
