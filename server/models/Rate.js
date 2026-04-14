const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Rate = sequelize.define('Rate', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    vehicleType: {
        type: DataTypes.ENUM('car', 'motorcycle'),
        allowNull: false
    },
    ratePerHour: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Rate in IDR per hour'
    },
    dailyMax: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: 'Maximum daily charge in IDR'
    },
    gracePeriodMinutes: {
        type: DataTypes.INTEGER,
        defaultValue: 15,
        comment: 'Free grace period in minutes'
    },
    lostTicketFee: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        comment: 'Penalty for lost tickets'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    effectiveFrom: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    effectiveTo: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'rates',
    indexes: [
        { fields: ['vehicle_type', 'is_active'] }
    ]
});

// Get active rate for vehicle type
Rate.getActiveRate = async function (vehicleType) {
    return await this.findOne({
        where: {
            vehicleType,
            isActive: true
        },
        order: [['effectiveFrom', 'DESC']]
    });
};

module.exports = Rate;
