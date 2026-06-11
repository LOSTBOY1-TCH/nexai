require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nexai_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Initialize Database
async function initializeDatabase() {
    const connection = await pool.getConnection();
    try {
        // Create users table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                avatar VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Create sessions table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token VARCHAR(500) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create OTP codes table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS otp_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                code VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                used BOOLEAN DEFAULT FALSE
            )
        `);

        // Create password resets table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token VARCHAR(500) NOT NULL,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create settings table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                theme VARCHAR(50) DEFAULT 'dark',
                accent_color VARCHAR(50) DEFAULT 'ff1744',
                voice_enabled BOOLEAN DEFAULT TRUE,
                voice_speed FLOAT DEFAULT 1.0,
                voice_pitch FLOAT DEFAULT 1.0,
                notifications BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create chat history table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS chat_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                chat_id VARCHAR(255) NOT NULL,
                chat_title VARCHAR(255),
                messages LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_chat (user_id, chat_id)
            )
        `);

        console.log('✓ Database initialized successfully');
    } catch (error) {
        if (!error.message.includes('already exists')) {
            console.error('Database initialization error:', error);
        }
    } finally {
        connection.release();
    }
}

module.exports = { pool, initializeDatabase };
