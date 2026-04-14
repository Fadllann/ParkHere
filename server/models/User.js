const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcrypt');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        validate: {
            len: [3, 50]
        }
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('admin', 'operator'),
        allowNull: false,
        defaultValue: 'operator'
    },
    email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: {
            isEmail: function(val) {
                if (val && !val.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                    throw new Error('Must be a valid email address');
                }
            }
        }
    },
    fullName: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    lastLogin: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'users',
    hooks: {
        beforeCreate: async (user) => {
            if (user.password) {
                user.password = await bcrypt.hash(user.password, 10);
            }
        },
        beforeUpdate: async (user) => {
            if (user.changed('password')) {
                user.password = await bcrypt.hash(user.password, 10);
            }
        }
    },
    indexes: [
        { fields: ['username'], unique: true },
        { fields: ['role'] },
        { fields: ['is_active'] }
    ]
});

// Instance method to verify password
User.prototype.validatePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

// Remove password from JSON output
User.prototype.toJSON = function () {
    const values = { ...this.get() };
    delete values.password;
    return values;
};

module.exports = User;
