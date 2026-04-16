const express = require('express');
const router = express.Router();
const { postEntryEmergency } = require('../controllers/entryController');
const { emergencyLimiter } = require('../middleware/rateLimiter');

router.post('/emergency', emergencyLimiter, postEntryEmergency);

module.exports = router;
