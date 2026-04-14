const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const backupController = require('../controllers/backupController');

// Multer setup for importing database files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, `import-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
            cb(null, true);
        } else {
            cb(new Error('Only JSON files are allowed'));
        }
    }
});

router.use(authenticateToken);
router.use(authorizeRoles('admin'));

router.get('/status', backupController.getBackupStatus);
router.post('/', backupController.triggerBackup);
router.post('/import', upload.single('backupFile'), backupController.importDatabase);
router.post('/auto', backupController.configureAutoBackup);

module.exports = router;
