require('dotenv').config();
const { User, Rate, Setting, BackupSettings, Payment, Ticket, CashierLog, syncDatabase } = require('../models');
const cashierService = require('../services/cashierService');

const seedData = async () => {
    try {
        // Sync all models
        await syncDatabase();

        // Create default admin user
        const [adminUser] = await User.findOrCreate({
            where: { username: 'admin' },
            defaults: {
                username: 'admin',
                password: 'admin123',
                role: 'admin',
                email: 'admin@parkhere.com',
                fullName: 'System Administrator'
            }
        });
        // Create default operator
        const [, operatorCreated] = await User.findOrCreate({
            where: { username: 'operator' },
            defaults: {
                username: 'operator',
                password: 'operator123',
                role: 'operator',
                email: 'operator@parkhere.com',
                fullName: 'Default Operator'
            }
        });
        // Create default rates (in IDR)
        const defaultRates = [
            { vehicleType: 'motorcycle', ratePerHour: 2000,  dailyMax: 16000, gracePeriodMinutes: 15, lostTicketFee: 50000},
            { vehicleType: 'car',        ratePerHour: 5000,  dailyMax: 40000, gracePeriodMinutes: 15, lostTicketFee: 100000 }
        ];

        for (const rateData of defaultRates) {
            const [, created] = await Rate.findOrCreate({
                where: { vehicleType: rateData.vehicleType, isActive: true },
                defaults: rateData
            });
        }

        // Create default settings
        // General settings
        const defaultSettings = [
            { key: 'max_capacity',      value: 100,                              description: 'Maximum parking capacity',          category: 'general' },
            { key: 'parking_name',      value: 'ParkHere',                  description: 'Parking facility name',             category: 'general' },
            { key: 'parking_address',   value: 'Alamat',    description: 'Parking address',                   category: 'general' },
            { key: 'enable_lpr',        value: true,                             description: 'Enable license plate recognition',  category: 'general' },
            { key: 'globalLostTicketFee', value: 200000,                          description: 'Global default lost ticket fee (IDR)', category: 'pricing' },

            // Regulation settings stored as JSON objects in setting_value
            {
                key: 'regulation_auto_mark_lost',
                value: {
                    enabled: true,
                    mode: 'daily',         // 'daily' | 'scheduled'
                    cutoffTime: '07:00',   // used by daily mode
                    scheduledDate: '',     // used by scheduled mode (YYYY-MM-DD)
                    scheduledTime: '07:00' // used by scheduled mode
                },
                description: 'Auto mark lost ticket regulation settings',
                category: 'regulation'
            },
            {
                key: 'regulation_auto_report',
                value: {
                    enabled: true,
                    reportTime: '08:00'
                },
                description: 'Auto report regulation settings',
                category: 'regulation'
            }
        ];

        for (const setting of defaultSettings) {
            await Setting.set(setting.key, setting.value, setting.description);
        }

        // Create default BackupSettings
        const defaultBackupSettings = await BackupSettings.findOne();
        if (!defaultBackupSettings) {
            await BackupSettings.create({
                isEnabled: false,
                interval: null,
                lastBackupAt: null,
                lastBackupStatus: null,
                lastBackupFile: null
            });
        }

        // Backfill ledger from existing payments (idempotent via paymentId)
        const payments = await Payment.findAll({
            order: [['paidAt', 'ASC'], ['id', 'ASC']],
            include: [{ model: Ticket, as: 'ticket', attributes: ['ticketNumber'], required: false }]
        });
        for (const p of payments) {
            const ref = p.ticket?.ticketNumber || String(p.id);
            const desc =
                p.ticket?.ticketNumber
                    ? `Payment — ${p.ticket.ticketNumber}`
                    : p.isLostTicket
                      ? `Lost ticket — ${p.vehicleType || 'unknown'}`
                      : `Payment #${p.id}`;
            await cashierService.recordIncomeFromPayment({
                payment: p,
                createdBy: p.operatorId || adminUser.id,
                description: desc,
                referenceId: ref
            });
        }

        // Recompute ledger balances to ensure consistency
        // (in case payments were added/modified before seeding)
        await cashierService.recomputeAllBalances();

        process.exit(0);
    } catch (error) {
        console.error('Seed failed:', error);
        process.exit(1);
    }
};

module.exports = { seedData };

// Only auto-run if this file is executed directly
if (require.main === module) {
    seedData();
}