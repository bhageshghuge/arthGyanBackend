const express = require("express");
const User = require("../models/User");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs"); // Add this for handling streams
const nodeCache = require("node-cache");
require("dotenv").config();
// Configure multer to handle file uploads in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

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
  const { name, phoneNumber, email } = req.body;

  if (!name || !phoneNumber || !email) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // Check if a user already exists with the same phone number or email
    let user = await User.findOne({ $or: [{ phoneNumber }, { email }] });

    if (user) {
      return res.status(400).json({
        error: `User already registered with ${
          user.phoneNumber === phoneNumber ? "this phone number" : "this email"
        }`,
      });
    }

    // Create a new user
    user = new User({ name, phoneNumber, email });
    await user.save();

    // // Generate OTP
    // const otp = 1933;
    // user.otp = otp;
    // user.otpExpiresAt = Date.now() + 5 * 60 * 1000; // Expires in 5 minutes
    // await user.save();

    // console.log("Generated OTP for:", user.fullName); // Replace with SMS sending logic

    res.status(200).json({ message: "User Registration Successfull" });
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
  const { identifier, pin } = req.body; // Use identifier (either phoneNumber or email)

  // Ensure PIN is provided and is exactly 4 digits
  if (!pin || pin.length !== 4) {
    return res.status(400).json({ error: "PIN must be 4 digits" });
  }

  try {
    let user;
    if (identifier.includes("@")) {
      // Assuming email contains '@'
      user = await User.findOne({ email: identifier });
    } else {
      user = await User.findOne({ phoneNumber: identifier });
    }

    // If user is not found
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the PIN
    user.pin = pin;
    await user.save();

    // Return the updated user info
    res.json({
      message: "PIN updated successfully",
      user: {
        phoneNumber: user.phoneNumber,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Error updating PIN:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/verify-pin", async (req, res) => {
  const { identifier, pin } = req.body; // Use identifier (either phoneNumber or email)
  console.log(identifier, pin);

  if (!pin || pin.length !== 4) {
    return res.status(400).json({ error: "PIN must be 4 digits" });
  }

  try {
    // Check if the identifier is phone number or email and find user accordingly
    let user;
    if (identifier.includes("@")) {
      // Assuming email contains '@'
      user = await User.findOne({ email: identifier });
    } else {
      user = await User.findOne({ phoneNumber: identifier });
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.pin || user.pin !== pin) {
      return res.status(400).json({ error: "Invalid PIN" });
    }

    // PIN is correct
    // You can now perform additional actions, such as logging the user in or generating a token
    // const token = "dummy-token-" + Date.now(); // Replace with proper JWT token

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

    if (!user) {
      return res.status(404).json({ message: "User not found" }); // Send an error if the user does not exist
    }

    res.json({
      message: "User Exists",
      user: {
        phoneNumber,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error checking user:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Fetch user data by phone number
// Fetch user data by phoneNumber (GET)
router.get("/user/:identifier", async (req, res) => {
  const { identifier } = req.params; // This can be either phoneNumber or email

  try {
    // Check if identifier is a phone number or email
    const user = await User.findOne({
      $or: [{ phoneNumber: identifier }, { email: identifier }],
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return the user data
    res.status(200).json({
      message: "User data fetched successfully",
      user,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user data by phoneNumber (PUT)
router.post("/user/updateUser", async (req, res) => {
  const { email, updatedUser } = req.body;

  if (!email || !updatedUser) {
    console.error("Invalid request: Missing email or updatedUser");
    return res
      .status(400)
      .json({ error: "email and updatedUser are required" });
  }

  try {
    const user = await User.findOneAndUpdate(
      { email },
      { $set: updatedUser },
      { new: true, runValidators: true }
    );

    if (!user) {
      console.error("No user found with email:", email);
      return res.status(404).json({ error: "User not found" });
    }

    // Prepare the data to send to the external API
    const jsonRequest = {
      type: user.type,
      tax_status: user.tax_status,
      name: user.name, // Adjust as necessary based on the updatedUser data
      date_of_birth: user.date_of_birth, // Adjust based on the data
      gender: user.gender, // Adjust based on the data
      occupation: user.occupation, // Adjust based on the data
      pan: user.pan, // Adjust based on the data
      country_of_birth: user.country_of_birth, // Adjust based on the data
      place_of_birth: user.place_of_birth, // Adjust based on the data
      use_default_tax_residences: user.use_default_tax_residences,
      first_tax_residency: {
        country: user.first_tax_residency.country, // Adjust based on the data
        taxid_type: user.first_tax_residency.taxid_type,
        taxid_number: user.first_tax_residency.taxid_number, // Adjust based on the data
      },
      source_of_wealth: user.source_of_wealth, // Adjust based on the data
      income_slab: user.income_slab, // Adjust based on the data
      pep_details: user.pep_details, // Adjust based on the data
    };

    // Log jsonRequest to console before sending it to the external API
    console.log(jsonRequest);

    // Send data to the external API
    const accessToken = await getAccessToken();
    const response = await axios.post(
      "https://s.finprim.com/v2/investor_profiles",
      jsonRequest,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`, // Replace with actual access token
        },
      }
    );
    const externalApiId = response.data.id;

    // Store the id in your database (e.g., updating the user)
    user.investorId = externalApiId; // Assuming you have a field `externalApiId` in your User model
    await user.save();

    res.status(200).json({
      message: "User data updated and sent to external API successfully",
      user,
      externalApiResponse: response.data,
    });
  } catch (error) {
    console.error(
      "Error updating user data or sending data to external API:",
      error
    );
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
    // console.log("user found ", user);

    if (!user) {
      // New user
      user = new User({
        email,
        name,
        googleId,
        isGoogleUser: true,
      });
      await user.save();
      return res.json({
        message: "Google Sign-In successful",
        user: {
          email: user.email,
          name: user.name,
        },
        isNewUser: true, // Flag indicating this is a new user
      });
    }

    // Existing user
    res.json({
      message: "Google Sign-In successful",
      user: {
        email: user.email,
        name: user.name,
      },
      isNewUser: false, // Flag indicating this is an existing user
    });
  } catch (err) {
    console.error("Error in Google sign-in:", err);
    res.status(500).json({ error: err.message });
  }
});

// Route to upload a file and get the ID from the external API
router.post("/upload-file", upload.single("file"), async (req, res) => {
  console.log("Received file:", req.file); // This should log the file information

  try {
    // Ensure a file is uploaded
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Prepare the form data
    const formData = new FormData();

    // Check if the file is uploaded in memory (buffer) or on disk (path)
    if (req.file.buffer) {
      // For in-memory storage (buffer), append the buffer directly
      formData.append("file", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
    } else if (req.file.path) {
      // For disk storage (file path), create a stream
      const fileStream = fs.createReadStream(req.file.path);
      formData.append("file", fileStream, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
    } else {
      // If no valid file information is available
      return res.status(400).json({ error: "No file buffer or path found" });
    }

    // Add optional purpose if provided in the request body
    if (req.body.purpose) {
      formData.append("purpose", req.body.purpose);
    }

    // Make the request to the external API
    const accessToken = await getAccessToken();
    const response = await axios.post("https://s.finprim.com/files", formData, {
      headers: {
        Authorization: `Bearer ${accessToken}`, // Replace with actual access token
        ...formData.getHeaders(), // Form-data headers for multipart/form-data
      },
    });

    // Respond with the API response
    res.status(200).json({
      message: "File uploaded successfully",
      data: response.data,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res
      .status(500)
      .json({ error: "Error uploading file", details: error.message });
  }
});

router.post("/kyc-request", async (req, res) => {
  console.log("Received body:", req.body);

  const { email, jsonRequest } = req.body; // Removed id from the request body

  if (!jsonRequest) {
    return res.status(400).json({ error: "jsonRequest is required" });
  }

  try {
    const accessToken = await getAccessToken();

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    // Check if the user exists by email
    const user = await User.findOne({ email: email }); // Adjust based on how you identify users

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if the user already has an existing KYC request
    if (user.kycId) {
      console.log(`Checking existing KYC request with ID ${user.kycId}`);

      const kycResponse = await axios.get(
        `https://s.finprim.com/v2/kyc_requests/${user.kycId}`,
        { headers }
      );

      const kycExpiresAt = new Date(kycResponse.data.expires_at);
      const currentTime = new Date();

      if (kycExpiresAt > currentTime) {
        // KYC request is still valid, so update it
        console.log(
          `KYC request with ID ${user.kycId} is still valid. Updating it.`
        );
        const response = await axios.post(
          `https://s.finprim.com/v2/kyc_requests/${user.kycId}`,
          JSON.stringify(jsonRequest),
          { headers }
        );
        console.log("Updated KYC request:", response.data);
        res.status(200).json({
          message: "KYC request updated successfully",
          data: response.data,
        });
        return;
      } else {
        // KYC request is expired, so create a new one
        console.log("KYC request has expired. Creating a new KYC request.");
        const response = await axios.post(
          "https://s.finprim.com/v2/kyc_requests",
          JSON.stringify(jsonRequest),
          { headers }
        );
        console.log("New KYC request created:", response.data);
        user.kycId = response.data.id;
        await user.save(); // Save the new KYC request ID

        res.status(200).json({
          message: "KYC request created successfully",
          data: response.data,
        });
        return;
      }
    } else {
      // No existing KYC ID, so create a new request
      console.log("No existing KYC request. Creating a new one.");
      const response = await axios.post(
        "https://s.finprim.com/v2/kyc_requests",
        JSON.stringify(jsonRequest),
        { headers }
      );
      console.log("New KYC request created:", response.data);
      user.kycId = response.data.id;
      await user.save(); // Save the new KYC request ID

      res.status(200).json({
        message: "KYC request created successfully",
        data: response.data,
      });
    }
  } catch (error) {
    console.error(
      "Error handling KYC requestsss:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({
      error: "Error handling KYC request",
      details: error.response ? error.response.data : error.message,
    });
  }
});
// GET KYC request by ID
router.get("/kyc/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const accessToken = await getAccessToken();

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    // Make the API request using axios
    const response = await axios.get(
      `https://s.finprim.com/v2/kyc_requests/${id}`,
      { headers }
    );

    // Send the KYC request data back as response
    res.status(200).json(response.data);
  } catch (error) {
    // Handle errors (e.g., API errors, network issues)
    if (error.response) {
      // If the error is from the external API
      res.status(error.response.status).json({
        message: error.response.data.message || "Error fetching KYC details",
      });
    } else {
      // If there’s a different error (e.g., network)
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
});

router.post("/generate-identity-document", async (req, res) => {
  const { email, postbackUrl } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Retrieve the KYC request ID from the database or any other source
    const kycRequestId = user.kycId; // Assuming you have the kycRequestId stored in the user document

    if (!kycRequestId) {
      return res.status(400).json({ error: "KYC request ID not found" });
    }

    // Prepare the data to send to the external API
    const jsonRequest = {
      kyc_request: kycRequestId,
      type: "aadhaar",
      postback_url: postbackUrl,
    };

    // Log the request body for debugging
    console.log(jsonRequest);

    // Fetch the access token to authenticate the request to the external API
    const accessToken = await getAccessToken();

    // Send the data to the external API to create the identity document
    const response = await axios.post(
      "https://s.finprim.com/v2/identity_documents",
      JSON.stringify(jsonRequest),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`, // Replace with actual access token
          "Content-Type": "application/json",
        },
      }
    );

    // Handle the response from the external API
    const identityDocument = response.data;

    // You can save this identity document ID in your database if necessary
    user.identityDocumentId = identityDocument.id; // Save the returned identity document ID
    await user.save();

    res.status(200).json({
      message: "Identity document generated successfully",
      identityDocument,
    });
  } catch (error) {
    console.error("Error generating identity document:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Route to generate eSign
router.post("/create-esign", async (req, res) => {
  const { email, postbackUrl } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Retrieve the KYC request ID
    const kycRequestId = user.kycId; // Assuming the kycRequestId is stored in the user document

    if (!kycRequestId) {
      return res.status(400).json({ error: "KYC request ID not found" });
    }

    // Prepare the data for the external API
    const jsonRequest = {
      kyc_request: kycRequestId,
      postback_url: postbackUrl,
    };

    console.log("Requesting eSign with data:", jsonRequest);

    // Fetch the access token for authentication
    const accessToken = await getAccessToken();

    // Send the request to create an eSign
    const response = await axios.post(
      "https://s.finprim.com/v2/esigns",
      JSON.stringify(jsonRequest),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Handle the API response
    const esign = response.data;

    console.log("eSign created:", esign);

    // Optionally save the eSign ID to the user record
    user.esignId = esign.id; // Save the eSign ID if needed
    await user.save();

    res.status(200).json({
      message: "eSign created successfully",
      esign,
    });
  } catch (error) {
    console.error("Error creating eSign:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// router.all("/callback", (req, res) => {
//   // Extract query parameters
//   const { esign, identity_document, status } = req.query;

//   if (esign) {
//     console.log(`eSign Callback Received`);
//     console.log(`eSign ID: ${esign}`);
//     console.log(`Status: ${status}`);

//     // Perform necessary actions for eSign response
//     // Example: Update database, notify users, etc.

//     // Redirect to app's deep link for eSign
//     const deepLink = `com.bhageshghuge.arthgyandashboard://callback?esign=${esign}&status=${status}`;
//     return res.redirect(deepLink);
//   }

//   if (identity_document) {
//     console.log(`Identity Document Callback Received`);
//     console.log(`Identity Document ID: ${identity_document}`);
//     console.log(`Status: ${status}`);

//     // Perform necessary actions for Identity Document response
//     // Example: Update database, notify users, etc.

//     // Redirect to app's deep link for Identity Document
//     const deepLink = `com.bhageshghuge.arthgyandashboard://callback?identity_document=${identity_document}&status=${status}`;
//     return res.redirect(deepLink);
//   }

//   // If neither esign nor identity_document is present
//   res.status(400).send("Missing required fields");
// });
router.all("/callback", (req, res) => {
  // Use router.all to handle both GET and POST
  const { identity_document, status } = req.query; // Use req.query for GET params

  if (identity_document && status) {
    console.log(`Identity Document: ${identity_document}`);
    console.log(`Status: ${status}`);

    // Perform any necessary actions with the data (e.g., store, process)

    // Redirect to the app's deep link, passing the data
    const deepLink = `com.bhageshghuge.arthgyandashboard://callback?identity_document=${identity_document}&status=${status}`;
    res.redirect(deepLink); // Redirect to the deep link in your app
  } else {
    res.status(400).send("Missing required fields");
  }
});
router.all("/callback-esign", (req, res) => {
  // Use router.all to handle both GET and POST
  const { esign, status } = req.query; // Use req.query for GET params

  if (esign && status) {
    console.log(`esign: ${esign}`);
    console.log(`Status: ${status}`);

    // Perform any necessary actions with the data (e.g., store, process)

    // Redirect to the app's deep link, passing the data
    const deepLink = `com.bhageshghuge.arthgyandashboard://callback-esign?esign=${esign}&status=${status}`;
    res.redirect(deepLink); // Redirect to the deep link in your app
  } else {
    res.status(400).send("Missing required fields");
  }
});

module.exports = router;
