const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CashierLog = sequelize.define('CashierLogA', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    type: {
        type: DataTypes.ENUM('income', 'outcome'),
        allowNull: false,
        comment: 'Income (money in) or Outcome (money out)'
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
            min: 0,
            notEmpty: true
        },
        comment: 'Transaction amount in Rupiah'
    },
    source: {
        type: DataTypes.ENUM('payment', 'expense', 'refund', 'manual', 'adjustment'),
        allowNull: false,
        comment: 'Where the transaction originated from'
    },
    description: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Transaction details or notes'
    },
    referenceId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'External reference (payment ID, ticket number, etc)'
    },
    paymentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: 'uq_payment_source', // Unique if source is payment
        references: {
            model: 'payments',
            key: 'id'
        },
        onDelete: 'SET NULL',
        comment: 'Associated payment (if source is payment)'
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'SET NULL',
        comment: 'User who created the transaction'
    },
    balanceAfter: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
            notEmpty: true
        },
        comment: 'Running balance after this transaction'
    },
    isVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        comment: 'Manual verification status (for non-payment sources)'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Additional notes or audit information'
    }
}, {
    tableName: 'cashier_logs',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: false,
    paranoid: false,
    indexes: [
        { fields: ['created_at'] },
        { fields: ['type'] },
        { fields: ['source'] },
        { fields: ['payment_id'] },
        { fields: ['created_by'] },
        { unique: false, fields: ['type', 'created_at'] }
    ],
    comment: 'Ledger of all cashier transactions (income and outcome) with running balance'
});

module.exports = CashierLog;
