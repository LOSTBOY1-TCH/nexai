const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// CORS Configuration - Allow all origins for development
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests from:
        // 1. The same server (no origin header)
        // 2. Localhost and localhost variants
        // 3. All HTTPS origins (for production)
        // 4. Render deployment domains
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            process.env.FRONTEND_URL,
            'https://nexai-f9g9.onrender.com',
            /\.onrender\.com$/,  // Allow all Render domains
            /\.vercel\.app$/,    // Allow all Vercel domains
            /localhost/          // Allow all localhost variants
        ];

        // If no origin (same-origin requests), always allow
        if (!origin || origin === undefined) {
            return callback(null, true);
        }

        // Check if origin is allowed
        const isAllowed = allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') {
                return origin === allowed;
            }
            if (allowed instanceof RegExp) {
                return allowed.test(origin);
            }
            return false;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed for origin: ' + origin), false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200,
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexai';

// Import database schemas FIRST (before routes)
require('./db');

mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
    .then(() => console.log('✓ MongoDB connected successfully'))
    .catch(err => {
        console.error('✗ MongoDB connection error:', err.message);
        console.error('Using URI:', mongoUri);
    });

// ============================================================================
// API ROUTES (will be initialized after mongoose connection)
// ============================================================================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Store routes to be registered after MongoDB connects
let routesRegistered = false;

function registerRoutes() {
    if (routesRegistered) return;
    
    // Import and register auth routes
    const authRoutes = require('./api/auth');
    app.use('/api/auth', authRoutes);

    // Import and register chat routes
    const chatRoutes = require('./api/chat');
    app.use('/api/chat', chatRoutes);

    // Import and register AI routes
    const aiRoutes = require('./api/ai');
    app.use('/api/ai', aiRoutes);
    
    routesRegistered = true;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.path,
        method: req.method 
    });
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    
    // Handle CORS errors
    if (err.message.includes('CORS')) {
        return res.status(403).json({
            error: 'CORS Error',
            message: err.message,
            origin: req.get('origin')
        });
    }

    // Handle MongoDB errors
    if (err.name === 'MongoError' || err.name === 'MongoServerError') {
        return res.status(500).json({
            error: 'Database Error',
            message: err.message
        });
    }

    // Handle validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message,
            details: err.errors
        });
    }

    // Default error response
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        path: req.path,
        method: req.method
    });
});

// ============================================================================
// SERVER START
// ============================================================================

// Wait for MongoDB connection before registering routes
mongoose.connection.on('connected', () => {
    registerRoutes();
    console.log('✓ Routes registered');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error after initial connect:', err);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════╗
║         NEXAI Server Running            ║
║  http://localhost:${PORT}              ║
╚════════════════════════════════════════╝
    `);
    console.log('CORS enabled for:');
    console.log('  - localhost:3000, localhost:3001');
    console.log('  - *.onrender.com');
    console.log('  - *.vercel.app');
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('Waiting for MongoDB connection...');
});

module.exports = app;
