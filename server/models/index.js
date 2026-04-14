const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Import all models
const User = require('./User');
const Ticket = require('./Ticket');
const Payment = require('./Payment');
const Rate = require('./Rate');
const PlateCapture = require('./PlateCapture');
const ActivityLog = require('./ActivityLog');
const Setting = require('./Setting');
const BackupSettings = require('./BackupSettings');
const CashierLog = require('./CashierLog');

// Define Relationships

// User -> Payment (operator who processed payment)
User.hasMany(Payment, { foreignKey: 'operatorId', as: 'processedPayments' });
Payment.belongsTo(User, { foreignKey: 'operatorId', as: 'operator' });

// User -> ActivityLog
User.hasMany(ActivityLog, { foreignKey: 'userId', as: 'activities' });
ActivityLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });



// Ticket -> Payment
Ticket.hasOne(Payment, { foreignKey: 'ticketId', as: 'payment' });
Payment.belongsTo(Ticket, { foreignKey: 'ticketId', as: 'ticket' });

// Ticket -> PlateCapture
Ticket.hasMany(PlateCapture, { foreignKey: 'ticketId', as: 'plateCaptures' });
PlateCapture.belongsTo(Ticket, { foreignKey: 'ticketId', as: 'ticket' });

// User -> CashierLog (creator)
User.hasMany(CashierLog, { foreignKey: 'createdBy', as: 'cashierLogs' });
CashierLog.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// Payment -> CashierLog (one ledger row per payment income)
Payment.hasOne(CashierLog, { foreignKey: 'paymentId', as: 'cashierLog' });
CashierLog.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

async function ensureBarcodeColumns() {
    const qi = sequelize.getQueryInterface();
    const ticketsDesc = await qi.describeTable('tickets');
    if (!ticketsDesc.barcode_data) {
        await qi.addColumn('tickets', 'barcode_data', {
            type: DataTypes.TEXT,
            allowNull: true
        });
        console.log('Added missing column tickets.barcode_data');
    }
}
// Sync all models and ensure barcode columns exist
const syncDatabase = async () => {
    try {
        await sequelize.sync();
        await ensureBarcodeColumns();
        console.log('All models synchronized successfully.');
    } catch (error) {
        console.error('Error synchronizing models:', error.message);
        throw error;
    }
};


module.exports = {
    sequelize,
    User,
    Ticket,
    Payment,
    Rate,
    PlateCapture,
    ActivityLog,
    Setting,
    BackupSettings,
    CashierLog,
    syncDatabase
};
