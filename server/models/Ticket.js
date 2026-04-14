const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Ticket = sequelize.define('Ticket', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    ticketNumber: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    barcodeData: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    plateNumber: {
        type: DataTypes.STRING(20),
        allowNull: false,
        set(value) {
            this.setDataValue('plateNumber', value.toUpperCase().replace(/\s+/g, ''));
        }
    },
    vehicleType: {
        type: DataTypes.ENUM('car', 'motorcycle'),
        allowNull: false,
        defaultValue: 'car'
    },
    entryTime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    exitTime: {
        type: DataTypes.DATE,
        allowNull: true
    },
    entryImagePath: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    exitImagePath: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'paid', 'lost', 'cancelled'),
        defaultValue: 'active'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'tickets',
    hooks: {
        beforeCreate: (ticket) => {
            if (!ticket.ticketNumber) {
                // Generate ticket number: PKG-YYYYMMDD-XXXX
                const date = new Date();
                const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
                const random = Math.floor(1000 + Math.random() * 9000);
                ticket.ticketNumber = `PKG-${dateStr}-${random}`;
            }
        }
    },
    indexes: [
        { fields: ['plate_number'] },
        { fields: ['status'] },
        { fields: ['entry_time'] }
    ]
});

// Calculate parking duration in minutes
Ticket.prototype.getDurationMinutes = function () {
    const endTime = this.exitTime || new Date();
    const diff = endTime - this.entryTime;
    return Math.ceil(diff / (1000 * 60));
};

// Format duration as human-readable string
Ticket.prototype.getFormattedDuration = function () {
    const minutes = this.getDurationMinutes();
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return `${days}d ${remainingHours}h ${mins}m`;
    }
    return `${hours}h ${mins}m`;
};

module.exports = Ticket;
