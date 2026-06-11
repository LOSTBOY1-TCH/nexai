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
const { pool, initializeDatabase } = require('./db');

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

        const connection = await pool.getConnection();
        try {
            // Check if user exists
            const [existingUser] = await connection.execute(
                'SELECT id FROM users WHERE email = ? OR username = ?',
                [email, username]
            );

            if (existingUser.length > 0) {
                return res.status(400).json({ success: false, message: 'Email or username already exists' });
            }

            // Hash password
            const hashedPassword = await bcryptjs.hash(password, 10);

            // Create user
            await connection.execute(
                'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                [username, email, hashedPassword]
            );

            // Generate OTP
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60000);

            await connection.execute(
                'INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)',
                [email, otpCode, expiresAt]
            );

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
        } finally {
            connection.release();
        }
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

        const connection = await pool.getConnection();
        try {
            const [otpRecords] = await connection.execute(
                'SELECT * FROM otp_codes WHERE email = ? AND code = ? AND used = FALSE ORDER BY created_at DESC LIMIT 1',
                [email, code]
            );

            if (otpRecords.length === 0) {
                return res.status(400).json({ success: false, message: 'Invalid OTP' });
            }

            const otp = otpRecords[0];
            if (new Date() > otp.expires_at) {
                return res.status(400).json({ success: false, message: 'OTP expired' });
            }

            // Mark OTP as used
            await connection.execute('UPDATE otp_codes SET used = TRUE WHERE id = ?', [otp.id]);

            // Get user
            const [users] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);

            if (users.length === 0) {
                return res.status(400).json({ success: false, message: 'User not found' });
            }

            // Generate JWT
            const token = jwt.sign(
                { id: users[0].id, email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRY || '7d' }
            );

            // Create session
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await connection.execute(
                'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
                [users[0].id, token, expiresAt]
            );

            res.json({ success: true, token, userId: users[0].id });
        } finally {
            connection.release();
        }
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

        const connection = await pool.getConnection();
        try {
            const [users] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);

            if (users.length === 0) {
                return res.status(400).json({ success: false, message: 'User not found' });
            }

            const user = users[0];
            const isPasswordCorrect = await bcryptjs.compare(password, user.password);

            if (!isPasswordCorrect) {
                return res.status(400).json({ success: false, message: 'Invalid password' });
            }

            // Generate JWT
            const token = jwt.sign(
                { id: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRY || '7d' }
            );

            // Create session
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await connection.execute(
                'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
                [user.id, token, expiresAt]
            );

            res.json({
                success: true,
                token,
                userId: user.id,
                username: user.username,
                email: user.email,
                avatar: user.avatar
            });
        } finally {
            connection.release();
        }
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
        const connection = await pool.getConnection();
        try {
            const [users] = await connection.execute(
                'SELECT id, username, email, avatar, created_at FROM users WHERE id = ?',
                [req.userId]
            );

            if (users.length === 0) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            res.json({ success: true, user: users[0] });
        } finally {
            connection.release();
        }
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
        const connection = await pool.getConnection();
        try {
            await connection.execute('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, req.userId]);
            res.json({ success: true, avatar: avatarPath });
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete avatar
app.delete('/api/user/avatar', verifyToken, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        try {
            const [users] = await connection.execute('SELECT avatar FROM users WHERE id = ?', [req.userId]);

            if (users.length > 0 && users[0].avatar) {
                const filePath = path.join(__dirname, 'public', users[0].avatar);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            await connection.execute('UPDATE users SET avatar = NULL WHERE id = ?', [req.userId]);
            res.json({ success: true });
        } finally {
            connection.release();
        }
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
        const connection = await pool.getConnection();
        try {
            const [settings] = await connection.execute(
                'SELECT * FROM settings WHERE user_id = ?',
                [req.userId]
            );

            if (settings.length === 0) {
                // Create default settings
                await connection.execute(
                    'INSERT INTO settings (user_id, theme) VALUES (?, ?)',
                    [req.userId, 'dark']
                );
                return res.json({ success: true, settings: { theme: 'dark', accent_color: 'ff1744' } });
            }

            res.json({ success: true, settings: settings[0] });
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update settings
app.put('/api/settings', verifyToken, async (req, res) => {
    try {
        const { theme, accent_color, voice_speed, voice_pitch, voice_enabled, notifications } = req.body;
        const connection = await pool.getConnection();
        try {
            await connection.execute(
                'UPDATE settings SET theme = ?, accent_color = ?, voice_speed = ?, voice_pitch = ?, voice_enabled = ?, notifications = ? WHERE user_id = ?',
                [theme || 'dark', accent_color || 'ff1744', voice_speed || 1.0, voice_pitch || 1.0, voice_enabled !== false, notifications !== false, req.userId]
            );
            res.json({ success: true });
        } finally {
            connection.release();
        }
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
        const connection = await pool.getConnection();
        try {
            const [chats] = await connection.execute(
                'SELECT id, chat_id, chat_title, created_at, updated_at FROM chat_history WHERE user_id = ? ORDER BY updated_at DESC',
                [req.userId]
            );
            res.json({ success: true, chats });
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get chat by ID
app.get('/api/chats/:chatId', verifyToken, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        try {
            const [chats] = await connection.execute(
                'SELECT * FROM chat_history WHERE user_id = ? AND chat_id = ?',
                [req.userId, req.params.chatId]
            );

            if (chats.length === 0) {
                return res.status(404).json({ success: false, message: 'Chat not found' });
            }

            const chat = chats[0];
            res.json({
                success: true,
                chat: {
                    id: chat.chat_id,
                    title: chat.chat_title,
                    messages: JSON.parse(chat.messages || '[]'),
                    created_at: chat.created_at
                }
            });
        } finally {
            connection.release();
        }
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

        const connection = await pool.getConnection();
        try {
            const [existingChat] = await connection.execute(
                'SELECT id FROM chat_history WHERE user_id = ? AND chat_id = ?',
                [req.userId, chatId]
            );

            if (existingChat.length > 0) {
                await connection.execute(
                    'UPDATE chat_history SET messages = ?, chat_title = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND chat_id = ?',
                    [JSON.stringify(messages), chatTitle, req.userId, chatId]
                );
            } else {
                await connection.execute(
                    'INSERT INTO chat_history (user_id, chat_id, chat_title, messages) VALUES (?, ?, ?, ?)',
                    [req.userId, chatId, chatTitle, JSON.stringify(messages)]
                );
            }

            res.json({ success: true });
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete chat
app.delete('/api/chats/:chatId', verifyToken, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        try {
            await connection.execute(
                'DELETE FROM chat_history WHERE user_id = ? AND chat_id = ?',
                [req.userId, req.params.chatId]
            );
            res.json({ success: true });
        } finally {
            connection.release();
        }
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
// Start Server
// ===========================

async function startServer() {
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`\n✓ NEXAI Server running on port ${PORT}`);
            console.log(`✓ Open http://localhost:${PORT} in your browser\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
