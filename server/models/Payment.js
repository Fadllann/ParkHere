const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Payment = sequelize.define('Payment', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    ticketId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'tickets',
            key: 'id'
        }
    },
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    paymentMethod: {
        type: DataTypes.ENUM('cash', 'card', 'digital'),
        allowNull: false,
        defaultValue: 'cash'
    },
    durationMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    rateApplied: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: 'Hourly rate applied at time of payment'
    },
    operatorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    paidAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    isLostTicket: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Whether this payment is for a lost ticket'
    },
    lostTicketFee: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: 'Amount charged for lost ticket'
    },
    vehicleType: {
        type: DataTypes.ENUM('car', 'motorcycle'),
        allowNull: true,
        comment: 'Vehicle type for lost ticket payments'
    }
}, {
    tableName: 'payments',
    indexes: [
        { fields: ['ticket_id'] },
        { fields: ['payment_method'] },
        { fields: ['paid_at'] },
        { fields: ['operator_id'] }
    ]
});

module.exports = Payment;
