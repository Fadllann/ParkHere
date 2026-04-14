/**
 * Barcode Service - Simplified
 * 
 * Barcode now encodes ONLY the ticket number (e.g. "T-AB3XY").
 * This keeps the barcode short and clean for thermal printers.
 */

// Generate barcode data — just the ticket number
const generateTicketBarcode = async (ticket) => {
    return ticket.ticketNumber;
};

// Verify barcode data — since it's just a ticket number string,
// return an object with { t: ticketNumber } to maintain compatibility
// with existing code that does `verified.t`
const verifyTicketBarcode = (barcodeData) => {
    try {
        // First try to parse as JSON (backward compat with old signed barcodes)
        const data = JSON.parse(barcodeData);
        if (data && data.t) {
            return data; // Old format still works
        }
        return null;
    } catch {
        // Not JSON — it's the new simple ticket number format
        if (typeof barcodeData === 'string' && barcodeData.trim().length > 0) {
            return { t: barcodeData.trim() };
        }
        return null;
    }
};

module.exports = {
    generateTicketBarcode,
    verifyTicketBarcode
};