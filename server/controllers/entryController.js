const { ActivityLog } = require('../models');

/**
 * Kiosk "emergency / problem" — logs for admin/operator dashboard (public, rate-limited).
 */
const postEntryEmergency = async (req, res, next) => {
    try {
        await ActivityLog.log({
            userId: null,
            action: 'ENTRY_EMERGENCY',
            entityType: 'kiosk',
            entityId: null,
            details: {
                source: 'auto-entry',
                message: 'Tombol darurat / gangguan ditekan di Gerbang Masuk',
                userAgent: req.get('user-agent') || null
            },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Petugas telah diberi tahu. Silakan tunggu di lokasi.'
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { postEntryEmergency };
