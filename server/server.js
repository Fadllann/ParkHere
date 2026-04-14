const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { testConnection } = require('./config/database');
const { syncDatabase, User } = require('./models');
const { errorHandler, notFoundHandler, logger } = require('./middleware/errorHandler');
const { sanitizeInput } = require('./middleware/validation');

// Import routes
const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const exitRoutes = require('./routes/exit');
const backupRoutes = require('./routes/backup');
const transactionRoutes = require('./routes/transactions');

const app = express();
const PORT = process.env.PORT || 5000;

// Create logs directory
if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
}

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined', {
        stream: { write: (message) => logger.info(message.trim()) }
    }));
}

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Sanitize input
app.use(sanitizeInput);

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/exit', exitRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/backup', backupRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
    try {
        // Test database connection
        await testConnection();

        // Sync database models
        await syncDatabase();

        // auto seed on first run
        const userCount = await User.count();
        if (userCount === 0) {
            console.log('Seeding database with default data...');
            await require('./scripts/seedDb').seedData();
        }

        app.listen(PORT, () => {
            console.log(`
Management System API
Server running on: http://localhost:${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
      `);
        });
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();

module.exports = app;
