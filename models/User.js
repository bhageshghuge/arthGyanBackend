const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: String,
  phoneNumber: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  otp: String,
  otpExpiresAt: Date,
  pin: String, // Add this field to store the PIN
  panNumber: String, // Add this field to store the PAN number
  panUpdatedAt: String,
  occupation: String,
  dob: String,
  pincode: String,
  address: String,
  city: String,
  state: String,
  district: String,
  income: String,
  isGoogleUser: { type: Boolean, default: false },
  googleId: String,
});

const User = mongoose.model("User", userSchema);

module.exports = User;
