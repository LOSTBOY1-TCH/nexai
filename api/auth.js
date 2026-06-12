const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');

// Get models from db.js
const User = mongoose.model('User');
const OtpCode = mongoose.model('OtpCode');
const Session = mongoose.model('Session');

// Helper function to validate email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Helper function to hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper function to generate token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================================================
// POST /api/auth/register
// ============================================================================
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, passwordConfirm } = req.body;

        // Validate input
        if (!username || !email || !password || !passwordConfirm) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        if (password !== passwordConfirm) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Create new user
        const newUser = new User({
            username,
            email: email.toLowerCase(),
            password: hashPassword(password),
            isVerified: false
        });

        await newUser.save();

        // Generate OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otp = new OtpCode({
            email: email.toLowerCase(),
            code: otpCode,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        });

        await otp.save();

        // TODO: Send OTP email
        console.log(`[OTP] ${email}: ${otpCode}`);

        return res.status(201).json({
            message: 'User registered successfully. Check email for verification code.',
            userId: newUser._id
        });

    } catch (err) {
        console.error('[Auth Register Error]', err);
        res.status(500).json({ error: 'Registration failed: ' + err.message });
    }
});

// ============================================================================
// POST /api/auth/verify-otp
// ============================================================================
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ error: 'Email and code are required' });
        }

        // Find OTP
        const otpRecord = await OtpCode.findOne({
            email: email.toLowerCase(),
            code: code.trim()
        });

        if (!otpRecord) {
            return res.status(400).json({ error: 'Invalid or expired verification code' });
        }

        if (new Date() > otpRecord.expiresAt) {
            await OtpCode.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({ error: 'Verification code expired' });
        }

        // Find and verify user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        user.isVerified = true;
        await user.save();

        // Delete used OTP
        await OtpCode.deleteOne({ _id: otpRecord._id });

        // Generate session token
        const token = generateToken();
        const session = new Session({
            userId: user._id,
            token,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });

        await session.save();

        return res.json({
            message: 'Email verified successfully',
            token,
            userId: user._id,
            username: user.username,
            email: user.email,
            avatar: user.avatar
        });

    } catch (err) {
        console.error('[Auth Verify OTP Error]', err);
        res.status(500).json({ error: 'Verification failed: ' + err.message });
    }
});

// ============================================================================
// POST /api/auth/login
// ============================================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check if verified
        if (!user.isVerified) {
            return res.status(403).json({ 
                error: 'Email not verified',
                needsVerification: true 
            });
        }

        // Verify password
        const hashedPassword = hashPassword(password);
        if (user.password !== hashedPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate session token
        const token = generateToken();
        const session = new Session({
            userId: user._id,
            token,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });

        await session.save();

        return res.json({
            message: 'Login successful',
            token,
            userId: user._id,
            username: user.username,
            email: user.email,
            avatar: user.avatar
        });

    } catch (err) {
        console.error('[Auth Login Error]', err);
        res.status(500).json({ error: 'Login failed: ' + err.message });
    }
});

// ============================================================================
// POST /api/auth/logout
// ============================================================================
router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (token) {
            await Session.deleteOne({ token });
        }

        return res.json({ message: 'Logged out successfully' });

    } catch (err) {
        console.error('[Auth Logout Error]', err);
        res.status(500).json({ error: 'Logout failed: ' + err.message });
    }
});

// ============================================================================
// Middleware: Verify token
// ============================================================================
router.use((req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token && req.path !== '/login' && req.path !== '/register' && req.path !== '/verify-otp') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

module.exports = router;
