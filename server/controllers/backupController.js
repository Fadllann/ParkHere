const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const extract = require('extract-zip');
const {
    User,
    Ticket,
    Payment,
    Rate,
    Setting,
    ActivityLog,
    PlateCapture,
    BackupSettings,
    CashierLog,
    sequelize
} = require('../models');

const uploadPath = process.env.UPLOAD_PATH || './uploads';
const tempBackupDir = './temp-backups';

// Ensure temp directory exists
if (!fs.existsSync(tempBackupDir)) {
    fs.mkdirSync(tempBackupDir, { recursive: true });
}

// Configure what tables to backup
const getBackupData = async () => {
    const backup = {
        users: await User.findAll(),
        tickets: await Ticket.findAll(),
        payments: await Payment.findAll(),
        rates: await Rate.findAll(),
        settings: await Setting.findAll(),
        activityLogs: await ActivityLog.findAll(),
        plateCaptures: await PlateCapture.findAll(),
        backupSettings: await BackupSettings.findAll(),
        cashierLogs: await CashierLog.findAll(),
        version: '2.1',
        timestamp: new Date().toISOString()
    };
    return backup;
};

// 1. Manual Backup (NOW WITH ZIP + UPLOADS)
exports.triggerBackup = async (req, res, next) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFileName = `backup-${timestamp}.zip`;
    const zipFilePath = path.join(tempBackupDir, zipFileName);
    
    try {
        // Get backup data
        const backupData = await getBackupData();
        const jsonContent = JSON.stringify(backupData, null, 2);
        const jsonFilePath = path.join(tempBackupDir, 'backup.json');
        
        // Write JSON temporarily
        fs.writeFileSync(jsonFilePath, jsonContent);
        
        // Create ZIP archive
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipFilePath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            output.on('close', resolve);
            archive.on('error', reject);
            output.on('error', reject);
            
            archive.pipe(output);
            
            // Add JSON file
            archive.file(jsonFilePath, { name: 'backup.json' });
            
            // Add uploads folder if exists
            if (fs.existsSync(uploadPath)) {
                archive.directory(uploadPath, 'uploads');
            }
            
            archive.finalize();
        });
        
        // Log activity
        await ActivityLog.log({
            userId: req.userId,
            action: 'MANUAL_BACKUP',
            details: { fileName: zipFileName, includedFiles: true },
            ipAddress: req.ip
        });

        // Update BackupSettings
        let bs = await BackupSettings.findOne();
        if (!bs) bs = await BackupSettings.create();
        await bs.update({
            lastBackupAt: new Date(),
            lastBackupStatus: 'success',
            lastBackupFile: zipFileName
        });

        // Send ZIP file
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
        res.download(zipFilePath, zipFileName, (err) => {
            // Clean up temp files after sending
            setTimeout(() => {
                try {
                    if (fs.existsSync(jsonFilePath)) fs.unlinkSync(jsonFilePath);
                    if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
                } catch (e) {
                    console.error('Cleanup error:', e);
                }
            }, 1000);
            
            if (err) next(err);
        });
    } catch (error) {
        // Clean up on error
        try {
            if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
        } catch (e) {}
        
        // Update BackupSettings
        try {
            let bs = await BackupSettings.findOne();
            if (bs) {
                await bs.update({
                    lastBackupAt: new Date(),
                    lastBackupStatus: 'failed'
                });
            }
        } catch (e) {}
        
        next(error);
    }
};

// 2. Import / Restore Database (NOW WITH ZIP EXTRACTION)
exports.importDatabase = async (req, res, next) => {
    const t = await sequelize.transaction();
    let extractDir = null;
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Tidak ada file backup yang disediakan' });
        }

        // Create extraction directory
        extractDir = path.join(tempBackupDir, `extract-${Date.now()}`);
        fs.mkdirSync(extractDir, { recursive: true });
        
        // Extract ZIP
        await extract(req.file.path, { dir: extractDir });
        
        // Read backup.json from extracted files
        const jsonPath = path.join(extractDir, 'backup.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error('Invalid backup file: backup.json not found');
        }
        
        const fileContent = fs.readFileSync(jsonPath, 'utf8');
        const backupData = JSON.parse(fileContent);

        // Validation
        if (!backupData.version || !backupData.users) {
            throw new Error('Invalid backup file format');
        }

        // STEP 1: Clear database
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });

        await PlateCapture.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
        await ActivityLog.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
        await CashierLog.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
        await Payment.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
        await Ticket.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
        await BackupSettings.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
        await Setting.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
        await Rate.destroy({ where: {}, truncate: true, cascade: true, transaction: t });
        await User.destroy({ where: {}, truncate: true, cascade: true, transaction: t });

        // STEP 2: Restore database
        if (backupData.users.length) await User.bulkCreate(backupData.users, { transaction: t });
        if (backupData.rates.length) await Rate.bulkCreate(backupData.rates, { transaction: t });
        if (backupData.settings.length) await Setting.bulkCreate(backupData.settings, { transaction: t });
        if (backupData.backupSettings.length) await BackupSettings.bulkCreate(backupData.backupSettings, { transaction: t });
        if (backupData.tickets.length) await Ticket.bulkCreate(backupData.tickets, { transaction: t });
        if (backupData.payments.length) await Payment.bulkCreate(backupData.payments, { transaction: t });
        const ft = backupData.cashierLogs;
        if (Array.isArray(ft) && ft.length) {
            await CashierLog.bulkCreate(ft, { transaction: t });
        }
        if (backupData.plateCaptures.length) await PlateCapture.bulkCreate(backupData.plateCaptures, { transaction: t });
        if (backupData.activityLogs.length) await ActivityLog.bulkCreate(backupData.activityLogs, { transaction: t });

        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t });
        await t.commit();

        // STEP 3: Restore uploaded files
        const backupUploadsPath = path.join(extractDir, 'uploads');
        if (fs.existsSync(backupUploadsPath)) {
            // Clear old uploads
            if (fs.existsSync(uploadPath)) {
                fs.rmSync(uploadPath, { recursive: true, force: true });
            }
            
            // Copy restored uploads
            fs.cpSync(backupUploadsPath, uploadPath, { recursive: true, force: true });
        }

        await ActivityLog.log({
            userId: req.userId,
            action: 'IMPORT_DATABASE',
            details: { success: true, filesRestored: true },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Database dan file berhasil dipulihkan' });
    } catch (error) {
        await t.rollback();
        try { sequelize.query('SET FOREIGN_KEY_CHECKS = 1'); } catch(e) {}
        
        await ActivityLog.log({
            userId: req.userId,
            action: 'IMPORT_DATABASE',
            details: { success: false, error: error.message },
            ipAddress: req.ip
        });

        next(error);
    } finally {
        // Clean up temp files
        setTimeout(() => {
            try {
                if (req.file && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                if (extractDir && fs.existsSync(extractDir)) {
                    fs.rmSync(extractDir, { recursive: true, force: true });
                }
            } catch (e) {
                console.error('Cleanup error:', e);
            }
        }, 500);
    }
};

// 3. Get Backup Status
exports.getBackupStatus = async (req, res, next) => {
    try {
        let bs = await BackupSettings.findOne();
        if (!bs) {
            bs = await BackupSettings.create({
                isEnabled: false,
                interval: null,
                lastBackupAt: null,
                lastBackupStatus: null,
                lastBackupFile: null
            });
        }
        res.json({ success: true, data: { status: bs } });
    } catch (error) {
        next(error);
    }
};

// 4. Configure Auto Backup
exports.configureAutoBackup = async (req, res, next) => {
    try {
        const { isEnabled, interval } = req.body;
        let bs = await BackupSettings.findOne();
        if (!bs) bs = await BackupSettings.create();

        await bs.update({
            isEnabled,
            interval: isEnabled ? interval : null
        });

        await ActivityLog.log({
            userId: req.userId,
            action: 'AUTO_BACKUP_SETTINGS_CHANGED',
            details: { isEnabled, interval },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Pengaturan auto backup berhasil diperbarui', data: { status: bs } });
    } catch (error) {
        next(error);
    }
};