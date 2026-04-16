const rateLimit = require('express-rate-limit');
require('dotenv').config();

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 500,
    message: {
        success: false,
        message: 'Too many requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.headers['x-forwarded-for'] || 'unknown';
    }
});

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per 15 minutes
    message: {
        success: false,
        message: 'Too many login attempts. Please try again in 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

// Rate limit for ticket generation (to prevent abuse)
const ticketLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 tickets per minute
    message: {
        success: false,
        message: 'Too many ticket requests. Please wait a moment.'
    }
});

// Emergency button (public)
const emergencyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    message: {
        success: false,
        message: 'Terlalu banyak permintaan darurat. Tunggu sebentar atau hubungi petugas.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    apiLimiter,
    authLimiter,
    ticketLimiter,
    emergencyLimiter
};
