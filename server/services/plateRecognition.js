const axios = require('axios');

const PLATE_SERVICE_URL = process.env.PLATE_SERVICE_URL || 'http://plate_service:5001';

/**
 * Calls the Python YOLOv8 + EasyOCR microservice
 * @param {string} imageBase64 - data URI or raw base64
 * @returns {Promise<{ plate: string, confidence: number, valid: boolean, candidates: Array }>}
 */

const MAX_BODY = 32 * 1024 * 1024; // 32MB

async function recognizePlate(imageBase64) {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
        console.error('[PlateService] Invalid imageBase64 — type:', typeof imageBase64, '| value:', imageBase64);
        return { plate: 'UNKNOWN', confidence: 0, valid: false, candidates: [] };
    }

    const imgLength = imageBase64.length;
    const imgPrefix = imageBase64.substring(0, 55);
    console.log(`[PlateService] Preparing request | image length: ${imgLength} | prefix: ${imgPrefix}...`);

    let startTime;
    try {
        console.log(`[PlateService] POSTing to ${PLATE_SERVICE_URL}/detect with timeout 120s...`);
        startTime = Date.now();
        
        const response = await axios.post(
            `${PLATE_SERVICE_URL}/detect`,
            { image: imageBase64 },
            {
                timeout: 120000,
                maxContentLength: MAX_BODY,
                maxBodyLength: MAX_BODY,
                headers: { 'Content-Type': 'application/json' },
            }
        );

        const elapsed = Date.now() - startTime;
        console.log(`[PlateService] Response received in ${elapsed}ms | status: ${response.status} | data keys: ${Object.keys(response.data).join(', ')}`);
        console.log(`[PlateService] Response preview: ${JSON.stringify(response.data).substring(0, 300)}`);

        if (response.data?.success) {
            console.log(`[PlateService] SUCCESS | plate: ${response.data.plate} | confidence: ${response.data.confidence}`);
            return {
                plate: response.data.plate || 'UNKNOWN',
                confidence: response.data.confidence || 0,
                valid: response.data.valid || false,
                candidates: response.data.candidates || [],
            };
        }

        console.warn(`[PlateService] success=false | error: ${response.data?.error || 'no error msg'}`);
        return { plate: 'UNKNOWN', confidence: 0, valid: false, candidates: [] };

    } catch (err) {
        const elapsed = startTime ? Date.now() - startTime : 'unknown';
        console.error(`[PlateService] ERROR caught after ${elapsed}ms`);
        if (err.response) {
            // Got a response but it was an error status (e.g. 400, 500)
            console.error(`[PlateService] HTTP ${err.response.status} | data: ${JSON.stringify(err.response.data)}`);
        } else if (err.request) {
            // Request was made but no response received (timeout, network, etc.)
            console.error(`[PlateService] No response | message: ${err.message} | code: ${err.code}`);
        } else {
            // Request setup error
            console.error(`[PlateService] Setup error: ${err.message}`);
        }
        return { plate: 'UNKNOWN', confidence: 0, valid: false, candidates: [] };
    }
}

async function isServiceReady() {
    try {
        await axios.get(`${PLATE_SERVICE_URL}/health`, { timeout: 3000 });
        return true;
    } catch {
        return false;
    }
}

module.exports = { recognizePlate, isServiceReady };