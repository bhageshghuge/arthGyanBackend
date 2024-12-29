const express = require("express");
const User = require("../models/User");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const nodeCache = require("node-cache");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const cache = new nodeCache();

// Function to get access token
async function getAccessToken() {
  const cachedData = cache.get("access_token_data");
  if (cachedData && Date.now() < cachedData.expiryTime) {
    return cachedData.token;
  }

  try {
    const response = await axios.post(
      "https://s.finprim.com/v2/auth/arthgyan/token",
      new URLSearchParams({
        client_id: process.env.FINPRIM_CLIENT_ID,
        client_secret: process.env.FINPRIM_CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, expires_in } = response.data;
    const expiryTime = Date.now() + expires_in * 1000; // Convert seconds to milliseconds

    cache.set("access_token_data", { token: access_token, expiryTime });

    return access_token;
  } catch (error) {
    console.error("Error getting access token:", error);
    throw error;
  }
}

router.get("/pincode/:pincode", async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const response = await axios.get(
      `https://s.finprim.com/api/onb/pincodes/${req.params.pincode}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching pincode details:", {
      message: error.message,
      stack: error.stack,
    });

    // Return a simplified error response
    res.status(500).json({
      error: "Error fetching pincode details",
      details: error.message,
    });
  }
});

// Generate OTP
router.post("/send-otp", async (req, res) => {
  const { phoneNumber, name, email } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const user = await User.findOneAndUpdate(
      { phoneNumber },
      {
        phoneNumber,
        name,
        email,
        otp,
        otpExpiresAt: Date.now() + 5 * 60 * 1000,
      },
      { upsert: true, new: true }
    );

    console.log("OTP generated:", otp); // For debugging
    res.json({ message: "OTP sent successfully", otp }); // In production, send via SMS
  } catch (err) {
    console.error("Error sending OTP:", err);
    res.status(500).json({ error: err.message });
  }
});

// Check user
router.post("/check-user", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const user = await User.findOne({ phoneNumber });
    res.json({ exists: !!user });
  } catch (error) {
    console.error("Error checking user:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  const { phoneNumber, otp, name, email } = req.body;

  try {
    console.log("Verifying OTP:", { phoneNumber, otp }); // For debugging

    const user = await User.findOne({ phoneNumber });

    if (!user) {
      console.log("User not found");
      return res.status(400).json({ error: "User not found" });
    }

    console.log("Stored OTP:", user.otp); // For debugging
    console.log("OTP Expires At:", user.otpExpiresAt); // For debugging

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (user.otpExpiresAt < Date.now()) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    // Update user details
    if (name) user.name = name;
    if (email) user.email = email;

    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    // Generate a token (you should implement proper JWT token generation)
    const token = "dummy-token-" + Date.now(); // Replace with proper JWT token
    console.log(token);

    res.json({
      message: "OTP verified successfully",
      token,
      user: {
        phoneNumber,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    res.status(500).json({ error: err.message });
  }
});

// Google Sign-In
router.post("/google-signin", async (req, res) => {
  const { email, name, googleId } = req.body;

  try {
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        email,
        name,
        googleId,
        isGoogleUser: true,
      });
      await user.save();
    }

    // Generate a token (you should implement proper JWT token generation)
    const token = "dummy-token-" + Date.now(); // Replace with proper JWT token

    res.json({
      message: "Google Sign-In successful",
      token,
      user: {
        email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error("Error in Google sign-in:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
