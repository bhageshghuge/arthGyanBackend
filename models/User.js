const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  type: { type: String },
  tax_status: { type: String },
  name: { type: String, required: true },
  date_of_birth: { type: String },
  gender: { type: String },
  occupation: { type: String },
  pan: { type: String },
  country_of_birth: { type: String },
  place_of_birth: { type: String },
  use_default_tax_residences: { type: Boolean },
  first_tax_residency: {
    country: { type: String },
    taxid_type: { type: String },
    taxid_number: { type: String },
  },
  source_of_wealth: { type: String },
  income_slab: { type: String },
  pep_details: { type: String },
  ip_address: { type: String },
  pincode: { type: String },
  address: { type: String },
  city: { type: String },
  state: { type: String },
  district: { type: String },
  income: { type: Number },
  isGoogleUser: { type: Boolean, default: false },
  googleId: { type: String },
  panUpdatedAt: { type: Date },
  email: {
    type: String,
    required: true,
    validate: {
      validator: (v) =>
        /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v),
      message: "Invalid email format",
    },
  },
  phoneNumber: {
    type: String,
    unique: true,
    validate: {
      validator: (v) => /^[0-9]{10}$/.test(v),
      message: "Phone number must be 10 digits",
    },
  },
  pin: { type: String },
  investorId: { type: String },
  kycId: { type: String },
  identityDocumentId: { type: String },
});

// Create indexes
userSchema.index({ phoneNumber: 1, email: 1 });

const User = mongoose.model("User", userSchema);

module.exports = User;
