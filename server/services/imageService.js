const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadPath = process.env.UPLOAD_PATH || './uploads';

/**
 * Save base64 image to disk
 * @param {string} base64Data - Data URI or raw base64 string (e.g., "data:image/jpeg;base64,...")
 * @param {string} imageType - 'entry' or 'exit' (determines subfolder)
 * @returns {string} Relative file path for database storage
 */
async function saveBase64Image(base64Data, imageType = 'entry') {
    try {
        console.log(`[ImageService:${imageType}] saveBase64Image called | data type: ${typeof base64Data} | length: ${String(base64Data).length} | prefix: ${String(base64Data).substring(0, 50)}`);

        // Validate input
        if (!base64Data || typeof base64Data !== 'string') {
            throw new Error(`Invalid base64Data: type=${typeof base64Data}, expected string`);
        }

        if (base64Data.length === 0) {
            throw new Error('Empty base64 data');
        }

        // Extract base64 data if it includes the data URI prefix
        const base64Match = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        let imageBuffer, imageExt;

        if (base64Match) {
            imageExt = base64Match[1]; // jpg, png, etc.
            const base64Str = base64Match[2];
            
            // Validate base64 format
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Str)) {
                throw new Error('Invalid base64 characters detected');
            }
            
            try {
                imageBuffer = Buffer.from(base64Str, 'base64');
            } catch (decodeErr) {
                throw new Error(`Base64 decode failed: ${decodeErr.message}`);
            }
            
            console.log(`[ImageService:${imageType}] Extracted data URI | ext: ${imageExt} | decoded buffer size: ${imageBuffer.length}`);
        } else {
            // Assume raw base64, default to jpg
            // Validate base64 format
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
                throw new Error('Invalid base64 characters detected (raw format)');
            }
            
            try {
                imageBuffer = Buffer.from(base64Data, 'base64');
            } catch (decodeErr) {
                throw new Error(`Raw base64 decode failed: ${decodeErr.message}`);
            }
            
            imageExt = 'jpg';
            console.log(`[ImageService:${imageType}] Using raw base64 | decoded buffer size: ${imageBuffer.length}`);
        }

        // Validate decoded buffer size (10KB to 50MB reasonable range)
        if (imageBuffer.length < 10240) {
            console.warn(`[ImageService] ⚠️  Image is very small (${imageBuffer.length} bytes) - might be corrupted or invalid`);
        }
        if (imageBuffer.length > 50 * 1024 * 1024) {
            throw new Error(`Image too large: ${imageBuffer.length} bytes > 50MB limit`);
        }

        // Ensure uploads directory exists
        const uploadDir = path.join(uploadPath, 'plates');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log(`[ImageService] Created directory: ${uploadDir}`);
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomStr = crypto.randomBytes(4).toString('hex');
        const filename = `plate-${timestamp}-${randomStr}.${imageExt}`;
        const fullPath = path.join(uploadDir, filename);

        // Write file
        fs.writeFileSync(fullPath, imageBuffer);
        console.log(`[ImageService] File written successfully: ${fullPath} | size: ${imageBuffer.length} bytes`);

        // Verify file was written
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File verification failed: ${fullPath} does not exist after write`);
        }

        // Return relative path for database
        const relativePath = `uploads/plates/${filename}`;
        console.log(`[ImageService] ✓ Returning relative path: ${relativePath}`);
        return relativePath;
    } catch (error) {
        console.error('[ImageService] Error saving base64 image:', error.message);
        throw error;
    }
}

// delete image file
function deleteImage(filePath) {
    try {
        const fullPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
    } catch (error) {
        console.error('[ImageService] Error deleting image:', error);
    }
}

module.exports = {
    saveBase64Image,
    deleteImage
};