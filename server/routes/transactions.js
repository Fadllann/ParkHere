const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validation');

router.get(
    '/',
    authenticateToken,
    authorizeRoles('admin', 'operator'),
    transactionController.getTransactions
);

router.post(
    '/',
    authenticateToken,
    authorizeRoles('admin'),
    transactionController.createValidation,
    handleValidationErrors,
    transactionController.createTransaction
);

router.put(
    '/:id',
    authenticateToken,
    authorizeRoles('admin'),
    transactionController.updateValidation,
    handleValidationErrors,
    transactionController.updateTransaction
);

router.delete(
    '/:id',
    authenticateToken,
    authorizeRoles('admin'),
    transactionController.deleteValidation,
    handleValidationErrors,
    transactionController.deleteTransaction
);

module.exports = router;
