const express = require("express");
const User = require("../models/User");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const nodeCache = require("node-cache");
require("dotenv").config();

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

router.put("/user/:phoneNumber", async (req, res) => {
  const { phoneNumber } = req.params;
  const {
    fullName,
    email,
    panNumber,
    occupation,
    income,
    address,
    dob,
    pincode,
    city,
    district,
    state,
  } = req.body;

  try {
    // Find the user by phone number
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update user fields
    user.fullName = fullName || user.fullName;
    user.email = email || user.email;
    user.panNumber = panNumber || user.panNumber;
    user.occupation = occupation || user.occupation;
    user.income = income || user.income;
    user.address = address || user.address;
    user.dob = dob || user.dob;
    user.pincode = pincode || user.pincode;
    user.city = city || user.city;
    user.district = district || user.district;
    user.state = state || user.state;

    // Save the updated user to the database
    await user.save();

    res.status(200).json({
      message: "User information updated successfully",
      user,
    });
  } catch (error) {
    console.error("Error updating user data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/register", async (req, res) => {
  const { fullName, phoneNumber, email } = req.body;

  if (!fullName || !phoneNumber || !email) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    let user = await User.findOne({ phoneNumber });

    if (!user) {
      user = new User({ fullName, phoneNumber, email });
      await user.save();
    }

    // Generate OTP
    const otp = 1933;
    user.otp = otp;
    user.otpExpiresAt = Date.now() + 5 * 60 * 1000; // Expires in 5 minutes
    await user.save();

    console.log("Generated OTP:", user.fullName); // Replace with SMS sending logic

    res.status(200).json({ message: "OTP sent", username: user.fullName });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generate OTP
router.post("/send-otp", async (req, res) => {
  const { phoneNumber, name, email } = req.body;

  // Check if the phone number exists in the database
  const user = await User.findOne({ phoneNumber });

  if (!user) {
    // If the user doesn't exist
    return res.status(404).json({ error: "User not registered" });
  }

  const otp = 1933;

  try {
    // Update OTP for the user if the phone number exists
    await User.findOneAndUpdate(
      { phoneNumber },
      {
        otp,
        otpExpiresAt: Date.now() + 5 * 60 * 1000, // OTP expires after 5 minutes
      }
    );

    console.log("OTP generated:", otp); // For debugging
    res.json({ message: "OTP sent successfully", otp }); // In production, send via SMS
  } catch (err) {
    console.error("Error sending OTP:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/update-pin", async (req, res) => {
  const { phoneNumber, pin } = req.body;

  if (!pin || pin.length !== 4) {
    return res.status(400).json({ error: "PIN must be 4 digits" });
  }

  try {
    let user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.pin = pin; // Update the PIN
    await user.save();

    res.json({
      message: "PIN updated successfully",
      user: {
        phoneNumber,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error updating PIN:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Verify PIN
router.post("/verify-pin", async (req, res) => {
  const { phoneNumber, pin } = req.body;

  if (!pin || pin.length !== 4) {
    return res.status(400).json({ error: "PIN must be 4 digits" });
  }

  try {
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.pin || user.pin !== pin) {
      return res.status(400).json({ error: "Invalid PIN" });
    }

    // PIN is correct
    // You can now perform additional actions, such as logging the user in or generating a token
    // For example, generate a token (you should implement proper JWT token generation)
    const token = "dummy-token-" + Date.now(); // Replace with proper JWT token

    res.status(200).json({ message: "PIN verified successfully" });
  } catch (err) {
    console.error("Error verifying PIN:", err);
    res.status(500).json({ error: err.message });
  }
});

// Route to update PAN number
router.post("/update-pan", async (req, res) => {
  const { phoneNumber, panNumber } = req.body;

  if (!panNumber || panNumber.length !== 10) {
    return res.status(400).json({ error: "PAN number must be 10 characters" });
  }

  try {
    let user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.panNumber = panNumber; // Update the PAN number
    user.panUpdatedAt = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });
    await user.save();

    res.status(200).json({ message: "PAN number updated successfully" });
  } catch (error) {
    console.error("Error updating PAN:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
// Route to update occupation
router.post("/update-occupation", async (req, res) => {
  const { phoneNumber, occupation } = req.body;

  if (!occupation) {
    return res.status(400).json({ error: "Occupation is required" });
  }

  try {
    let user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.occupation = occupation; // Update the occupation
    await user.save();

    res.status(200).json({ message: "Occupation updated successfully" });
  } catch (error) {
    console.error("Error updating occupation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Route to update income
router.post("/update-income", async (req, res) => {
  const { phoneNumber, income } = req.body;

  if (!income) {
    return res.status(400).json({ error: "Income is required" });
  }

  try {
    let user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.income = income; // Update the income
    await user.save();

    res.status(200).json({ message: "Income updated successfully" });
  } catch (error) {
    console.error("Error updating income:", error);
    res.status(500).json({ error: "Internal server error" });
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
// Fetch user data by phone number
router.get("/user/:phoneNumber", async (req, res) => {
  const { phoneNumber } = req.params;

  try {
    // Find the user by phone number
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return the user data
    res.status(200).json({
      message: "User data fetched successfully",
      user: {
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        email: user.email,
        occupation: user.occupation,
        income: user.income,
        panNumber: user.panNumber,
        dob: user.dob,
        address: user.address,
        pincode: user.pincode,
        district: user.district,
        city: user.city,
        state: user.state,
      },
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  const { phoneNumber, otp } = req.body;

  try {
    const user = await User.findOne({ phoneNumber });

    if (!user) {
      console.log("User not found");
      return res.status(400).json({ error: "User not found" });
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (user.otpExpiresAt < Date.now()) {
      return res.status(400).json({ error: "OTP has expired" });
    }

    user.otp = null;
    user.otpExpiresAt = null;
    const hasPin = user.pin ? true : false;

    await user.save();

    // Generate a token (you should implement proper JWT token generation)
    const token = "dummy-token-" + Date.now(); // Replace with proper JWT token
    console.log(token);

    res.json({
      message: "OTP verified successfully",
      hasPin,
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
