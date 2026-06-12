require('dotenv').config();
const mongoose = require('mongoose');

async function connectDatabase() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexai_db';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB successfully');
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
    username:   { type: String, required: true, unique: true, trim: true },
    email:      { type: String, required: true, unique: true, lowercase: true },
    password:   { type: String, required: true },
    avatar:     { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    createdAt:  { type: Date, default: Date.now },
    updatedAt:  { type: Date, default: Date.now }
});
// Single index definition per field — no duplicates
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

const sessionSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token:     { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
});
sessionSchema.index({ userId: 1 });
sessionSchema.index({ token: 1 });
// TTL index — MongoDB auto-deletes expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const otpCodeSchema = new mongoose.Schema({
    email:     { type: String, required: true },
    code:      { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    used:      { type: Boolean, default: false }
});
otpCodeSchema.index({ email: 1 });
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
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    theme:         { type: String, default: 'dark' },
    accentColor:   { type: String, default: 'ff1744' },
    voiceEnabled:  { type: Boolean, default: true },
    voiceSpeed:    { type: Number, default: 1.0, min: 0.5, max: 2.0 },
    voicePitch:    { type: Number, default: 1.0, min: 0.5, max: 2.0 },
    notifications: { type: Boolean, default: true },
    updatedAt:     { type: Date, default: Date.now }
});
// Only define unique constraint on userId field, no duplicate indexes

const chatHistorySchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chatId:    { type: String, required: true },
    chatTitle: { type: String, default: 'New Chat' },
    messages:  { type: mongoose.Schema.Types.Mixed, default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
chatHistorySchema.index({ userId: 1 });
// Named unique compound index — name lets us drop/recreate it safely if needed
chatHistorySchema.index({ userId: 1, chatId: 1 }, { unique: true, name: 'userId_chatId_unique' });

// ── Models ────────────────────────────────────────────────────────────────────

const User          = mongoose.model('User', userSchema);
const Session       = mongoose.model('Session', sessionSchema);
const OtpCode       = mongoose.model('OtpCode', otpCodeSchema);
const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);
const Settings      = mongoose.model('Settings', settingsSchema);
const ChatHistory   = mongoose.model('ChatHistory', chatHistorySchema);

// ── Initialize ────────────────────────────────────────────────────────────────

async function initializeDatabase() {
    try {
        // Drop the old non-unique compound index on chathistories if it exists
        const chatCol = mongoose.connection.collection('chathistories');
        const indexes = await chatCol.indexes();
        
        // Find and drop conflicting indexes
        for (const idx of indexes) {
            // Drop old non-unique userId_chatId index if it exists
            if (idx.name === 'userId_1_chatId_1' && !idx.unique) {
                try {
                    await chatCol.dropIndex('userId_1_chatId_1');
                    console.log('✓ Dropped old non-unique chathistories index');
                } catch (dropErr) {
                    if (dropErr.codeName !== 'IndexNotFound') {
                        console.warn('Error dropping index:', dropErr.message);
                    }
                }
            }
        }
    } catch (e) {
        // Collection may not exist yet on a fresh DB — that's fine
        if (e.codeName !== 'NamespaceNotFound') {
            console.warn('Index migration warning (non-fatal):', e.message);
        }
    }

    try {
        await Promise.all([
            User.createIndexes(),
            Session.createIndexes(),
            OtpCode.createIndexes(),
            Settings.createIndexes(),
            ChatHistory.createIndexes()
        ]);
        console.log('✓ Database indexes initialized successfully');
    } catch (indexErr) {
        // Index conflict errors are usually safe to ignore on existing databases
        if (indexErr.code === 86 || indexErr.codeName === 'IndexKeySpecsConflict') {
            console.warn('⚠ Index conflict detected (existing DB), proceeding anyway:', indexErr.message);
        } else {
            throw indexErr;
        }
    }
}

module.exports = {
    connectDatabase,
    initializeDatabase,
    User, Session, OtpCode, PasswordReset, Settings, ChatHistory
};
