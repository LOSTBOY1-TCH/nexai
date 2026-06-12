require('dotenv').config();
const mongoose = require('mongoose');

async function connectDatabase() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexai_db';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB successfully');
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
    username:   { type: String, required: true, unique: true, trim: true, index: true },
    email:      { type: String, required: true, unique: true, lowercase: true, index: true },
    password:   { type: String, required: true },
    avatar:     { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    createdAt:  { type: Date, default: Date.now },
    updatedAt:  { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token:     { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true }
});
// TTL index: MongoDB auto-deletes expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const otpCodeSchema = new mongoose.Schema({
    email:     { type: String, required: true, index: true },
    code:      { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    used:      { type: Boolean, default: false }
});
// TTL: auto-delete stale OTPs 1 hour after expiry
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const passwordResetSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token:     { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const settingsSchema = new mongoose.Schema({
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    theme:        { type: String, default: 'dark' },
    accentColor:  { type: String, default: 'ff1744' },
    voiceEnabled: { type: Boolean, default: true },
    voiceSpeed:   { type: Number, default: 1.0 },
    voicePitch:   { type: Number, default: 1.0 },
    notifications:{ type: Boolean, default: true },
    updatedAt:    { type: Date, default: Date.now }
});

const chatHistorySchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    chatId:    { type: String, required: true },
    chatTitle: { type: String, default: 'New Chat' },
    messages:  { type: mongoose.Schema.Types.Mixed, default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
// Compound unique index prevents duplicate chatIds per user
chatHistorySchema.index({ userId: 1, chatId: 1 }, { unique: true });

// ── Models ────────────────────────────────────────────────────────────────────

const User          = mongoose.model('User', userSchema);
const Session       = mongoose.model('Session', sessionSchema);
const OtpCode       = mongoose.model('OtpCode', otpCodeSchema);
const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);
const Settings      = mongoose.model('Settings', settingsSchema);
const ChatHistory   = mongoose.model('ChatHistory', chatHistorySchema);

async function initializeDatabase() {
    // Ensure indexes are created
    await Promise.all([
        User.createIndexes(),
        Session.createIndexes(),
        OtpCode.createIndexes(),
        Settings.createIndexes(),
        ChatHistory.createIndexes()
    ]);
    console.log('✓ Database indexes initialized');
}

module.exports = { connectDatabase, initializeDatabase, User, Session, OtpCode, PasswordReset, Settings, ChatHistory };
