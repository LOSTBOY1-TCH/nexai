require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { connectDatabase, initializeDatabase, User, Session, OtpCode, PasswordReset, Settings, ChatHistory } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Multer Configuration
const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg', 'image/png', 'image/webp',
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// Email transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Middleware to verify JWT
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
}

// ===========================
// AUTHENTICATION ROUTES
// ===========================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, passwordConfirm } = req.body;

        if (!username || !email || !password || !passwordConfirm) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (password !== passwordConfirm) {
            return res.status(400).json({ success: false, message: 'Passwords do not match' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email or username already exists' });
        }

        // Hash password
        const hashedPassword = await bcryptjs.hash(password, 10);

        // Create user
        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });
        await newUser.save();

        // Generate OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000);

        const otp = new OtpCode({
            email,
            code: otpCode,
            expiresAt
        });
        await otp.save();

        // Send OTP email
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_FROM,
                to: email,
                subject: 'NEXAI - Email Verification',
                html: `<h2>Welcome to NEXAI!</h2><p>Your verification code is: <strong>${otpCode}</strong></p><p>This code expires in 10 minutes.</p>`
            });
        } catch (emailError) {
            console.log('Email not configured, but user registered. OTP:', otpCode);
        }

        res.json({ success: true, message: 'Registration successful. Check your email for verification code.' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ success: false, message: 'Email and code required' });
        }

        const otpRecord = await OtpCode.findOne({
            email,
            code,
            used: false
        }).sort({ createdAt: -1 });

        if (!otpRecord) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        if (new Date() > otpRecord.expiresAt) {
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        // Mark OTP as used
        otpRecord.used = true;
        await otpRecord.save();

        // Get user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user._id.toString(), email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '7d' }
        );

        // Create session
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const session = new Session({
            userId: user._id,
            token,
            expiresAt
        });
        await session.save();

        // Create default settings
        const existingSettings = await Settings.findOne({ userId: user._id });
        if (!existingSettings) {
            const defaultSettings = new Settings({
                userId: user._id,
                theme: 'dark',
                accentColor: 'ff1744'
            });
            await defaultSettings.save();
        }

        res.json({ success: true, token, userId: user._id.toString() });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }

        const isPasswordCorrect = await bcryptjs.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ success: false, message: 'Invalid password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user._id.toString(), email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '7d' }
        );

        // Create session
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const session = new Session({
            userId: user._id,
            token,
            expiresAt
        });
        await session.save();

        res.json({
            success: true,
            token,
            userId: user._id.toString(),
            username: user.username,
            email: user.email,
            avatar: user.avatar
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ===========================
// USER ROUTES
// ===========================

// Get user profile
app.get('/api/user/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('id username email avatar createdAt');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Upload avatar
app.post('/api/user/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const avatarPath = `/uploads/${req.file.filename}`;
        await User.findByIdAndUpdate(req.userId, { avatar: avatarPath });
        res.json({ success: true, avatar: avatarPath });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete avatar
app.delete('/api/user/avatar', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user && user.avatar) {
            const filePath = path.join(__dirname, 'public', user.avatar);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await User.findByIdAndUpdate(req.userId, { avatar: null });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ===========================
// SETTINGS ROUTES
// ===========================

// Get settings
app.get('/api/settings', verifyToken, async (req, res) => {
    try {
        let settings = await Settings.findOne({ userId: req.userId });

        if (!settings) {
            settings = new Settings({
                userId: req.userId,
                theme: 'dark',
                accentColor: 'ff1744'
            });
            await settings.save();
        }

        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update settings
app.put('/api/settings', verifyToken, async (req, res) => {
    try {
        const { theme, accentColor, voiceSpeed, voicePitch, voiceEnabled, notifications } = req.body;

        let settings = await Settings.findOne({ userId: req.userId });
        if (!settings) {
            settings = new Settings({ userId: req.userId });
        }

        settings.theme = theme || 'dark';
        settings.accentColor = accentColor || 'ff1744';
        settings.voiceSpeed = voiceSpeed || 1.0;
        settings.voicePitch = voicePitch || 1.0;
        settings.voiceEnabled = voiceEnabled !== false;
        settings.notifications = notifications !== false;
        settings.updatedAt = new Date();

        await settings.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ===========================
// CHAT HISTORY ROUTES
// ===========================

// Get all chats
app.get('/api/chats', verifyToken, async (req, res) => {
    try {
        const chats = await ChatHistory.find({ userId: req.userId })
            .select('chatId chatTitle createdAt updatedAt')
            .sort({ updatedAt: -1 });
        res.json({ success: true, chats });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get chat by ID
app.get('/api/chats/:chatId', verifyToken, async (req, res) => {
    try {
        const chat = await ChatHistory.findOne({
            userId: req.userId,
            chatId: req.params.chatId
        });

        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }

        res.json({
            success: true,
            chat: {
                id: chat.chatId,
                title: chat.chatTitle,
                messages: chat.messages || [],
                created_at: chat.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Save chat
app.post('/api/chats', verifyToken, async (req, res) => {
    try {
        const { chatId, chatTitle, messages } = req.body;

        if (!chatId || !Array.isArray(messages)) {
            return res.status(400).json({ success: false, message: 'Invalid data' });
        }

        let chat = await ChatHistory.findOne({
            userId: req.userId,
            chatId
        });

        if (chat) {
            chat.messages = messages;
            chat.chatTitle = chatTitle;
            chat.updatedAt = new Date();
            await chat.save();
        } else {
            chat = new ChatHistory({
                userId: req.userId,
                chatId,
                chatTitle,
                messages
            });
            await chat.save();
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete chat
app.delete('/api/chats/:chatId', verifyToken, async (req, res) => {
    try {
        await ChatHistory.deleteOne({
            userId: req.userId,
            chatId: req.params.chatId
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ===========================
// AI ROUTES (Proxy)
// ===========================

// Chat AI
app.post('/api/ai/chat', verifyToken, async (req, res) => {
    try {
        const { message, conversationHistory } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: 'Message required' });
        }

        // Format conversation for API
        const formattedHistory = conversationHistory?.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        })) || [];

        formattedHistory.push({ role: 'user', content: message });

        const response = await fetch('https://api.bk9.dev/ai/BK92', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: formattedHistory
            })
        });

        const data = await response.json();
        res.json({ success: true, response: data.response || data.message || 'No response' });
    } catch (error) {
        console.error('AI API error:', error);
        res.status(500).json({ success: false, message: 'AI service error' });
    }
});

// Vision AI
app.post('/api/ai/vision', verifyToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Image required' });
        }

        const imagePath = path.join(uploadsDir, req.file.filename);
        const imageBase64 = fs.readFileSync(imagePath, 'base64');

        const response = await fetch('https://api.bk9.dev/ai/vision', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: imageBase64,
                mimeType: req.file.mimetype,
                prompt: req.body.prompt || 'Analyze this image'
            })
        });

        const data = await response.json();
        res.json({ success: true, response: data.response || data.message || 'No response' });
    } catch (error) {
        console.error('Vision API error:', error);
        res.status(500).json({ success: false, message: 'Vision service error' });
    }
});

// ===========================
// File Upload
// ===========================

app.post('/api/upload', verifyToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        res.json({
            success: true,
            file: {
                name: req.file.originalname,
                size: req.file.size,
                path: `/uploads/${req.file.filename}`,
                mimeType: req.file.mimetype
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Upload error' });
    }
});

// ===========================
// Serve HTML
// ===========================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===========================
// Initialize and Start Server
// ===========================

async function startServer() {
    try {
        await connectDatabase();
        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════╗
║       NEXAI Server Started              ║
║     MongoDB Connected Successfully      ║
╚════════════════════════════════════════╝
            
Server running on: http://localhost:${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
