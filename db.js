require('dotenv').config();
const mongoose = require('mongoose');

// Database connection
async function connectDatabase() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexai_db';
        
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('✓ Connected to MongoDB successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        process.exit(1);
    }
}

// Define Schemas
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    avatar: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const sessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    token: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: Date
});

const otpCodeSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: true
    },
    expiresAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    used: {
        type: Boolean,
        default: false
    }
});

const passwordResetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    token: {
        type: String,
        required: true
    },
    expiresAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const settingsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    theme: {
        type: String,
        default: 'dark'
    },
    accentColor: {
        type: String,
        default: 'ff1744'
    },
    voiceEnabled: {
        type: Boolean,
        default: true
    },
    voiceSpeed: {
        type: Number,
        default: 1.0
    },
    voicePitch: {
        type: Number,
        default: 1.0
    },
    notifications: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const chatHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    chatId: {
        type: String,
        required: true
    },
    chatTitle: String,
    messages: {
        type: mongoose.Schema.Types.Mixed,
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Create indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
sessionSchema.index({ userId: 1 });
otpCodeSchema.index({ email: 1 });
settingsSchema.index({ userId: 1 });
chatHistorySchema.index({ userId: 1, chatId: 1 });

// Create Models
const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);
const OtpCode = mongoose.model('OtpCode', otpCodeSchema);
const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);

// Initialize Database
async function initializeDatabase() {
    try {
        // Models are auto-created by Mongoose
        console.log('✓ Database models initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

module.exports = {
    connectDatabase,
    initializeDatabase,
    User,
    Session,
    OtpCode,
    PasswordReset,
    Settings,
    ChatHistory
};
