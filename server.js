require('dotenv').config();

// ── Validate required env vars before anything else ───────────────────────────
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
    console.error('❌  Missing required environment variables:', missingEnv.join(', '));
    console.error('    Copy .env.example to .env and fill in all values.');
    process.exit(1);
}

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const fs        = require('fs');
const multer    = require('multer');
const bcryptjs  = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const nodemailer= require('nodemailer');
const crypto    = require('crypto');
const { connectDatabase, initializeDatabase, User, Session, OtpCode, Settings, ChatHistory } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Uploads directory ─────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false // allow inline scripts during dev; tighten in prod
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000'];

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('CORS: origin not allowed'));
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,
    message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, message: 'Rate limit reached. Slow down a little.' }
});

// ── File upload validation ────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.txt', '.doc', '.docx']);

// Magic-byte signatures for the image types we accept
const FILE_SIGNATURES = [
    { mime: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF] },
    { mime: 'image/png',  magic: [0x89, 0x50, 0x4E, 0x47] },
    { mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] } // RIFF header
];

function validateFileSignature(filePath, mimetype) {
    const sig = FILE_SIGNATURES.find(s => s.mime === mimetype);
    if (!sig) return true; // only validate image types; skip PDF/doc
    const buf = Buffer.alloc(sig.magic.length);
    const fd  = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, sig.magic.length, 0);
    fs.closeSync(fd);
    return sig.magic.every((byte, i) => buf[i] === byte);
}

const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
            return cb(new Error(`File type not allowed: ${file.mimetype}`));
        }
        cb(null, true);
    }
});

// ── Email transporter ─────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: parseInt(process.env.EMAIL_PORT, 10) === 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' }
});

// Verify transporter on startup (non-fatal)
transporter.verify().then(() => {
    console.log('✓ Email transport ready');
}).catch(err => {
    console.warn('⚠  Email transport not ready:', err.message);
    console.warn('   OTP emails will fail until SMTP is configured correctly.');
});

// ── Password validation ───────────────────────────────────────────────────────
function validatePassword(password) {
    const errors = [];
    if (!password || password.length < 8)    errors.push('at least 8 characters');
    if (!/[A-Z]/.test(password))             errors.push('one uppercase letter');
    if (!/[a-z]/.test(password))             errors.push('one lowercase letter');
    if (!/[0-9]/.test(password))             errors.push('one number');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('one special character');
    return errors;
}

// ── JWT / session middleware ──────────────────────────────────────────────────
async function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    // Confirm session is still active in DB
    const session = await Session.findOne({ token, userId: decoded.id });
    if (!session || session.expiresAt < new Date()) {
        if (session) await session.deleteOne(); // clean up expired entry
        return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }

    req.userId = decoded.id;
    next();
}

// ── Helper: issue JWT + create Session ────────────────────────────────────────
async function createSession(user) {
    const expiryDays = parseInt(process.env.JWT_EXPIRY_DAYS || '7', 10);
    const token = jwt.sign(
        { id: user._id.toString(), email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: `${expiryDays}d` }
    );
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    await Session.create({ userId: user._id, token, expiresAt });
    return { token, expiresAt };
}

// ── Helper: send OTP email ────────────────────────────────────────────────────
async function sendOtpEmail(email, otpCode) {
    await transporter.sendMail({
        from:    process.env.EMAIL_FROM,
        to:      email,
        subject: 'NEXAI — Email Verification Code',
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#111;color:#fff;border-radius:12px;">
                <h2 style="color:#ff1744;">Welcome to NEXAI!</h2>
                <p>Your email verification code is:</p>
                <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;background:#222;border-radius:8px;margin:20px 0;">
                    ${otpCode}
                </div>
                <p style="color:#aaa;font-size:13px;">This code expires in 10 minutes. Do not share it with anyone.</p>
            </div>`
    });
}

// ════════════════════════════════════════════════════════════════
// AUTHENTICATION ROUTES
// ════════════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password, passwordConfirm } = req.body;

        // ── Basic field checks ──
        if (!username || !email || !password || !passwordConfirm) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        if (password !== passwordConfirm) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }

        // ── Password strength ──
        const pwErrors = validatePassword(password);
        if (pwErrors.length) {
            return res.status(400).json({
                success: false,
                message: `Password must contain: ${pwErrors.join(', ')}.`
            });
        }

        // ── Username length ──
        if (username.trim().length < 3) {
            return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
        }

        // ── Duplicate check (single query) ──
        const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.trim() }] }).lean();
        if (existing) {
            const field = existing.email === email.toLowerCase() ? 'Email' : 'Username';
            return res.status(409).json({ success: false, message: `${field} is already registered.` });
        }

        // ── Hash password (cost 10 is fast enough & secure) ──
        const hashedPassword = await bcryptjs.hash(password, 10);

        // ── Create user (unverified) ──
        const newUser = await User.create({
            username: username.trim(),
            email:    email.toLowerCase(),
            password: hashedPassword,
            isVerified: false
        });

        // ── Generate OTP ──
        const otpCode  = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60_000);
        // Invalidate any previous unused OTPs for this email
        await OtpCode.deleteMany({ email: email.toLowerCase() });
        await OtpCode.create({ email: email.toLowerCase(), code: otpCode, expiresAt });

        // ── Send OTP email (required — registration fails if mail fails) ──
        try {
            await sendOtpEmail(email.toLowerCase(), otpCode);
        } catch (emailErr) {
            // Roll back user creation so they can try again
            await User.deleteOne({ _id: newUser._id });
            await OtpCode.deleteMany({ email: email.toLowerCase() });
            console.error('OTP email delivery failed:', emailErr.message);
            return res.status(502).json({
                success: false,
                message: 'Could not send verification email. Check your email address or try again later.'
            });
        }

        return res.json({
            success: true,
            message: 'Account created! Check your email for the 6-digit verification code.'
        });

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', authLimiter, async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ success: false, message: 'Email and code required.' });

        const otpRecord = await OtpCode.findOne({ email: email.toLowerCase(), code, used: false })
            .sort({ createdAt: -1 });

        if (!otpRecord) return res.status(400).json({ success: false, message: 'Invalid verification code.' });
        if (new Date() > otpRecord.expiresAt) return res.status(400).json({ success: false, message: 'Code has expired. Please register again.' });

        otpRecord.used = true;
        await otpRecord.save();

        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { isVerified: true },
            { new: true }
        );
        if (!user) return res.status(400).json({ success: false, message: 'User not found.' });

        const { token } = await createSession(user);

        // Create default settings in background (don't await)
        Settings.findOneAndUpdate(
            { userId: user._id },
            { $setOnInsert: { userId: user._id, theme: 'dark', accentColor: 'ff1744' } },
            { upsert: true, new: false }
        ).catch(() => {});

        return res.json({ success: true, token, userId: user._id.toString() });

    } catch (err) {
        console.error('OTP verify error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });

        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        const isMatch = await bcryptjs.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        if (!user.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'Email not verified. Please complete registration by entering the code sent to your email.',
                needsVerification: true
            });
        }

        const { token } = await createSession(user);

        return res.json({
            success: true, token,
            userId:   user._id.toString(),
            username: user.username,
            email:    user.email,
            avatar:   user.avatar
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// POST /api/auth/logout
app.post('/api/auth/logout', verifyToken, async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    await Session.deleteOne({ token });
    res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════
// USER ROUTES
// ════════════════════════════════════════════════════════════════

app.get('/api/user/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('username email avatar createdAt isVerified').lean();
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.post('/api/user/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

        // Validate magic bytes for image types
        if (!validateFileSignature(req.file.path, req.file.mimetype)) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, message: 'File content does not match its extension.' });
        }

        // Delete old avatar if present
        const user = await User.findById(req.userId);
        if (user?.avatar) {
            const oldPath = path.join(uploadsDir, path.basename(user.avatar));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const avatarPath = `/uploads/${req.file.filename}`;
        await User.findByIdAndUpdate(req.userId, { avatar: avatarPath });
        res.json({ success: true, avatar: avatarPath });
    } catch (err) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.delete('/api/user/avatar', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user?.avatar) {
            // FIX: avatars live in uploadsDir, not public/
            const filePath = path.join(uploadsDir, path.basename(user.avatar));
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await User.findByIdAndUpdate(req.userId, { avatar: null });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ════════════════════════════════════════════════════════════════
// SETTINGS ROUTES
// ════════════════════════════════════════════════════════════════

app.get('/api/settings', verifyToken, async (req, res) => {
    try {
        const settings = await Settings.findOneAndUpdate(
            { userId: req.userId },
            { $setOnInsert: { userId: req.userId, theme: 'dark', accentColor: 'ff1744' } },
            { upsert: true, new: true }
        ).lean();
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.put('/api/settings', verifyToken, async (req, res) => {
    try {
        const { theme, accentColor, voiceSpeed, voicePitch, voiceEnabled, notifications } = req.body;
        await Settings.findOneAndUpdate(
            { userId: req.userId },
            { $set: { theme, accentColor, voiceSpeed, voicePitch, voiceEnabled, notifications, updatedAt: new Date() } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ════════════════════════════════════════════════════════════════
// CHAT ROUTES
// ════════════════════════════════════════════════════════════════

app.get('/api/chats', verifyToken, async (req, res) => {
    try {
        const chats = await ChatHistory.find({ userId: req.userId })
            .select('chatId chatTitle createdAt updatedAt')
            .sort({ updatedAt: -1 })
            .lean();
        res.json({ success: true, chats });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.get('/api/chats/:chatId', verifyToken, async (req, res) => {
    try {
        const chat = await ChatHistory.findOne({ userId: req.userId, chatId: req.params.chatId }).lean();
        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found.' });
        res.json({ success: true, chat: { id: chat.chatId, title: chat.chatTitle, messages: chat.messages || [], created_at: chat.createdAt } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.post('/api/chats', verifyToken, async (req, res) => {
    try {
        const { chatId, chatTitle, messages } = req.body;
        if (!chatId || !Array.isArray(messages)) return res.status(400).json({ success: false, message: 'Invalid data.' });

        await ChatHistory.findOneAndUpdate(
            { userId: req.userId, chatId },
            { $set: { chatTitle, messages, updatedAt: new Date() } },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.delete('/api/chats/:chatId', verifyToken, async (req, res) => {
    try {
        await ChatHistory.deleteOne({ userId: req.userId, chatId: req.params.chatId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ════════════════════════════════════════════════════════════════
// AI ROUTES
// ════════════════════════════════════════════════════════════════

const AI_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url, options, timeoutMs = AI_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(id);
    }
}

const FALLBACK_RESPONSES = [
    "I'm having trouble reaching my AI engine right now. Please try again in a moment.",
    "The AI service is temporarily unavailable. Your message has been noted — please retry shortly.",
    "Connection to the AI provider timed out. Please check your network and try again."
];

app.post('/api/ai/chat', verifyToken, aiLimiter, async (req, res) => {
    try {
        const { message, conversationHistory } = req.body;
        if (!message) return res.status(400).json({ success: false, message: 'Message required.' });

        const history = (conversationHistory || []).map(m => ({
            role:    m.role === 'user' ? 'user' : 'assistant',
            content: m.content
        }));
        history.push({ role: 'user', content: message });

        let aiResponse;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const resp = await fetchWithTimeout('https://api.bk9.dev/ai/BK92', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ messages: history })
                }, AI_TIMEOUT_MS);

                if (!resp.ok) throw new Error(`API responded with ${resp.status}`);
                const data = await resp.json();
                aiResponse = data.response || data.message;
                if (aiResponse) break;
            } catch (e) {
                console.error(`AI attempt ${attempt + 1} failed:`, e.message);
                if (attempt === 0) await new Promise(r => setTimeout(r, 1000)); // small retry delay
            }
        }

        if (!aiResponse) {
            aiResponse = FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
        }

        res.json({ success: true, response: aiResponse });
    } catch (err) {
        console.error('AI chat error:', err);
        res.status(500).json({ success: false, message: 'AI service error.', response: FALLBACK_RESPONSES[0] });
    }
});

app.post('/api/ai/vision', verifyToken, aiLimiter, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Image required.' });

        if (!validateFileSignature(req.file.path, req.file.mimetype)) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, message: 'Invalid image file.' });
        }

        const imageBase64 = fs.readFileSync(req.file.path, 'base64');
        // Clean up temp file immediately
        fs.unlinkSync(req.file.path);

        const resp = await fetchWithTimeout('https://api.bk9.dev/ai/vision', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ image: imageBase64, mimeType: req.file.mimetype, prompt: req.body.prompt || 'Analyze this image' })
        });

        const data = await resp.json();
        res.json({ success: true, response: data.response || data.message || 'No response' });
    } catch (err) {
        console.error('Vision API error:', err);
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, message: 'Vision service error.' });
    }
});

// ════════════════════════════════════════════════════════════════
// FILE UPLOAD
// ════════════════════════════════════════════════════════════════

app.post('/api/upload', verifyToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
        res.json({ success: true, file: {
            name:     req.file.originalname,
            size:     req.file.size,
            path:     `/uploads/${req.file.filename}`,
            mimeType: req.file.mimetype
        }});
    } catch (err) {
        res.status(500).json({ success: false, message: 'Upload error.' });
    }
});

// ════════════════════════════════════════════════════════════════
// CATCH-ALL → SPA
// ════════════════════════════════════════════════════════════════

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'File too large (max 5 MB).' });
    console.error('Unhandled error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════

async function startServer() {
    try {
        await connectDatabase();
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════╗
║        NEXAI Server  (fixed)            ║
╚════════════════════════════════════════╝
  http://localhost:${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
            `);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();
module.exports = app;
