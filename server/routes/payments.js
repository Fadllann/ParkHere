const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken, optionalAuth, authorizeRoles } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validation');


/**
 * @route GET /api/payments/calculate
 * @desc Calculate parking fee for a ticket
 * @access Public
 */
router.get(
    '/calculate',
    paymentController.calculateFee
);

/**
 * @route POST /api/payments/calculate
 * @desc Same as GET; use for long signed barcode payloads (avoids query string limits)
 * @access Public
 */
router.post(
    '/calculate',
    paymentController.calculateFee
);

/**
 * @route POST /api/payments
 * @desc Process payment
 * @access Private (Operator+)
 */
router.post(
    '/',
    authenticateToken,
    authorizeRoles('admin', 'operator'),
    paymentController.processPaymentValidation,
    handleValidationErrors,
    paymentController.processPayment
);

/**
 * @route GET /api/payments/history
 * @desc Get payment history
 * @access Private
 */
router.get(
    '/history',
    authenticateToken,
    paymentController.getPaymentHistory
);

/**
 * @route POST /api/payments/:id/refund
 * @desc Record refund as ledger outcome (admin)
 * @access Admin
 */
router.post(
    '/:id/refund',
    authenticateToken,
    authorizeRoles('admin'),
    paymentController.refundPaymentValidation,
    handleValidationErrors,
    paymentController.refundPayment
);

/**
 * @route GET /api/payments/:identifier
 * @desc Get payment by ID or receipt number
 * @access Private
 */
router.get(
    '/:identifier',
    authenticateToken,
    paymentController.getPayment
);

module.exports = router;
