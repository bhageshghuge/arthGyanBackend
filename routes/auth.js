const express = require('express');
const User = require('../models/User');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate OTP
router.post('/send-otp', async (req, res) => {
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
                otpExpiresAt: Date.now() + 5 * 60 * 1000 
            },
            { upsert: true, new: true }
        );
        
        console.log('OTP generated:', otp); // For debugging
        res.json({ message: 'OTP sent successfully', otp }); // In production, send via SMS
    } catch (err) {
        console.error('Error sending OTP:', err);
        res.status(500).json({ error: err.message });
    }
});

// Check user
router.post('/check-user', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const user = await User.findOne({ phoneNumber });
        res.json({ exists: !!user });
    } catch (error) {
        console.error('Error checking user:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    const { phoneNumber, otp, name, email } = req.body;

    try {
        console.log('Verifying OTP:', { phoneNumber, otp }); // For debugging

        const user = await User.findOne({ phoneNumber });
        
        if (!user) {
            console.log('User not found');
            return res.status(400).json({ error: 'User not found' });
        }

        console.log('Stored OTP:', user.otp); // For debugging
        console.log('OTP Expires At:', user.otpExpiresAt); // For debugging

        if (!user.otp || user.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        if (user.otpExpiresAt < Date.now()) {
            return res.status(400).json({ error: 'OTP has expired' });
        }

        // Update user details
        if (name) user.name = name;
        if (email) user.email = email;

        user.otp = null;
        user.otpExpiresAt = null;
        await user.save();

        // Generate a token (you should implement proper JWT token generation)
        const token = 'dummy-token-' + Date.now(); // Replace with proper JWT token
        console.log(token)

        res.json({ 
            message: 'OTP verified successfully', 
            token,
            user: { 
                phoneNumber, 
                name: user.name, 
                email: user.email 
            } 
        });
    } catch (err) {
        console.error('Error verifying OTP:', err);
        res.status(500).json({ error: err.message });
    }
});

// Google Sign-In
router.post('/google-signin', async (req, res) => {
    const { email, name, googleId } = req.body;

    try {
        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                email,
                name,
                googleId,
                isGoogleUser: true
            });
            await user.save();
        }

        // Generate a token (you should implement proper JWT token generation)
        const token = 'dummy-token-' + Date.now(); // Replace with proper JWT token

        res.json({ 
            message: 'Google Sign-In successful', 
            token,
            user: { 
                email, 
                name: user.name 
            } 
        });
    } catch (err) {
        console.error('Error in Google sign-in:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;