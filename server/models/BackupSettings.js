const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BackupSettings = sequelize.define('BackupSettings', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    isEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    interval: {
        type: DataTypes.ENUM('daily', 'weekly', 'monthly'),
        allowNull: true
    },
    lastBackupAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    lastBackupStatus: {
        type: DataTypes.STRING(20), // 'success', 'failed'
        allowNull: true
    },
    lastBackupFile: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    tableName: 'backup_settings',
    timestamps: true
});

module.exports = BackupSettings;
