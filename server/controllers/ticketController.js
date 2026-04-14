const { body } = require('express-validator');
const { Op } = require('sequelize');
const { Ticket, Payment, PlateCapture, ActivityLog, Rate, Setting } = require('../models');
const barcodeService = require('../services/barcodeService');
const imageService = require('../services/imageService');
const { recognizePlate } = require('../services/plateRecognition');

const createTicketValidation = [
    body('plateNumber')
        .optional().trim()
        .isLength({ min: 2, max: 20 }).withMessage('Plat nomor harus antara 2-20 karakter'),
    body('vehicleType')
        .isIn(['car', 'motorcycle']).withMessage('Tipe kendaraan tidak valid')
];

// unique ticket ID: T-XXXXX
function generateTicketNumber() {
    const base = Date.now().toString(36).slice(-3).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `T-${base}${rand}`;
}

// Background OCR: runs after ticket is already created & response sent
async function runOcrAndUpdateTicket(ticketId, capturedImage, entryImagePath) {
    console.log(`[OCR:bg] Starting for ticket ${ticketId}`);
    try {
        const ocrResult = await recognizePlate(capturedImage);
        console.log(`[OCR:bg] Result for ticket ${ticketId}:`, JSON.stringify(ocrResult));

        if (!ocrResult || ocrResult.plate === 'UNKNOWN' || !ocrResult.plate) {
            console.log(`[OCR:bg] No valid plate for ticket ${ticketId}, keeping UNKNOWN`);
            return;
        }

        const normalizedPlate = ocrResult.plate.toUpperCase().replace(/\s+/g, '');
        console.log(`[OCR:bg] Updating ticket ${ticketId} plate → ${normalizedPlate}`);

        const [rowsUpdated] = await Ticket.update(
            { plateNumber: normalizedPlate },
            { where: { id: ticketId } }
        );

        console.log(`[OCR:bg] Update result: ${rowsUpdated} row(s) updated for ticket ${ticketId}`);

        if (entryImagePath) {
            await PlateCapture.create({
                ticketId,
                plateNumber: normalizedPlate,
                imagePath: entryImagePath,
                captureType: 'entry',
                confidenceScore: ocrResult.confidence ? Math.round(ocrResult.confidence * 100) : null,
                rawOcrText: ocrResult.candidates?.map(c => c.text).join(', ') || null,
                isManualOverride: false,
                capturedAt: new Date(),
            }).catch(err => console.warn('[OCR:bg] PlateCapture save failed:', err.message));
        }

    } catch (err) {
        console.error(`[OCR:bg] Failed for ticket ${ticketId}:`, err.message, err.stack);
    }
}

// Create ticket responds instantly, OCR runs in background
const createTicket = async (req, res, next) => {
    try {
        const { vehicleType, notes, capturedImage, plateNumber: manualPlate } = req.body;
        console.log('[Ticket] Creating vehicleType:', vehicleType, '| hasImage:', !!capturedImage, '| manualPlate:', manualPlate || 'none');

        const initialPlate = manualPlate
            ? manualPlate.toUpperCase().replace(/\s+/g, '')
            : 'UNKNOWN';

        // Capacity check
        const [maxCapacity, activeCount] = await Promise.all([
            Setting.get('max_capacity', 100),
            Ticket.count({ where: { status: 'active' } })
        ]);

        if (activeCount >= parseInt(maxCapacity)) {
            return res.status(409).json({
                success: false,
                message: `Kapasitas maksimum (${maxCapacity} kendaraan) telah tercapai.`,
                data: { maxCapacity: parseInt(maxCapacity), activeCount }
            });
        }

        // Duplicate check only for real manual plates
        if (manualPlate) {
            const existing = await Ticket.findOne({
                where: { plateNumber: initialPlate, status: 'active' }
            });
            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: 'Kendaraan dengan plat nomor ini sudah terdaftar di parkir.',
                    data: { ticketNumber: existing.ticketNumber, entryTime: existing.entryTime }
                });
            }
        }

        // Save image
        let entryImagePath = null;
        if (capturedImage) {
            try {
                entryImagePath = await imageService.saveBase64Image(capturedImage, 'entry');
            } catch (imgErr) {
                console.warn('[Ticket] Image save failed:', imgErr.message);
            }
        }

        // Generate ticket number
        const ticketNumber = generateTicketNumber();

        const barcodeData = await barcodeService.generateTicketBarcode({
            ticketNumber,
            plateNumber: initialPlate,
            entryTime: new Date(),
            vehicleType
        });

        const ticket = await Ticket.create({
            ticketNumber,
            barcodeData,
            plateNumber: initialPlate,
            vehicleType,
            entryImagePath,
            notes,
            entryTime: new Date()
        });

        const [parkingName, parkingAddress] = await Promise.all([
            Setting.get('parking_name', 'ParkHere'),
            Setting.get('parking_address', '')
        ]);

        await ActivityLog.log({
            userId: req.userId || null,
            action: 'TICKET_CREATED',
            entityType: 'ticket',
            entityId: ticket.id,
            details: { ticketNumber, plateNumber: initialPlate, vehicleType, hasImage: !!entryImagePath },
            ipAddress: req.ip
        });

        res.status(201).json({
            success: true,
            message: 'Tiket berhasil dibuat',
            data: {
                ticket: {
                    id: ticket.id,
                    ticketNumber: ticket.ticketNumber,
                    plateNumber: ticket.plateNumber,
                    vehicleType: ticket.vehicleType,
                    entryTime: ticket.entryTime,
                    barcodeData: ticket.barcodeData,
                    status: ticket.status
                },
                ocr: null,
                parkingName,
                parkingAddress
            }
        });

        // Fire OCR in background after response
        if (capturedImage && !manualPlate) {
            setImmediate(() => {
                runOcrAndUpdateTicket(ticket.id, capturedImage, entryImagePath);
            });
        }

    } catch (error) {
        next(error);
    }
};

const getTicket = async (req, res, next) => {
    try {
        const { identifier } = req.params;
        let ticket;
        if (/^\d+$/.test(identifier)) {
            ticket = await Ticket.findByPk(identifier, {
                include: [{ model: Payment, as: 'payment' }, { model: PlateCapture, as: 'plateCaptures' }]
            });
        } else {
            ticket = await Ticket.findOne({
                where: { ticketNumber: identifier },
                include: [{ model: Payment, as: 'payment' }, { model: PlateCapture, as: 'plateCaptures' }]
            });
        }

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket tidak ditemukan' });
        }

        const rate = await Rate.getActiveRate(ticket.vehicleType);
        const duration = ticket.getDurationMinutes();
        let estimatedCost = 0;
        if (rate && ticket.status === 'active') estimatedCost = calculateCost(duration, rate);

        res.json({
            success: true,
            data: {
                ticket: { ...ticket.toJSON(), formattedDuration: ticket.getFormattedDuration(), durationMinutes: duration },
                estimatedCost,
                rate: rate ? { ratePerHour: rate.ratePerHour, dailyMax: rate.dailyMax, gracePeriodMinutes: rate.gracePeriodMinutes } : null
            }
        });
    } catch (error) { next(error); }
};

const searchTickets = async (req, res, next) => {
    try {
        const { plateNumber, ticketNumber, status, vehicleType, fromDate, toDate, page = 1, limit = 20 } = req.query;
        const where = {};
        if (plateNumber) where.plateNumber = { [Op.like]: `%${plateNumber.toUpperCase()}%` };
        if (ticketNumber) where.ticketNumber = { [Op.like]: `%${ticketNumber.toUpperCase()}%` };
        if (status) where.status = status;
        if (vehicleType) where.vehicleType = vehicleType;
        if (fromDate) where.entryTime = { ...where.entryTime, [Op.gte]: new Date(fromDate) };
        if (toDate) where.entryTime = { ...where.entryTime, [Op.lte]: new Date(toDate) };

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const { count, rows: tickets } = await Ticket.findAndCountAll({
            where,
            include: [{ model: Payment, as: 'payment' }],
            order: [['entryTime', 'DESC']],
            limit: parseInt(limit),
            offset
        });

        res.json({
            success: true,
            data: {
                tickets: tickets.map(t => ({ ...t.toJSON(), formattedDuration: t.getFormattedDuration(), durationMinutes: t.getDurationMinutes() })),
                pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / parseInt(limit)) }
            }
        });
    } catch (error) { next(error); }
};

const getActiveTickets = async (req, res, next) => {
    try {
        const tickets = await Ticket.findAll({
            where: { status: 'active' },
            order: [['entryTime', 'DESC']],
            limit: 100,
            attributes: ['id', 'ticketNumber', 'plateNumber', 'vehicleType', 'entryTime', 'barcodeData', 'status']
        });
        res.json({
            success: true,
            data: {
                tickets: tickets.map(t => ({
                    id: t.id, ticketNumber: t.ticketNumber, plateNumber: t.plateNumber,
                    vehicleType: t.vehicleType, entryTime: t.entryTime,
                    barcodeData: t.barcodeData, formattedDuration: formatDuration(t.entryTime)
                })),
                total: tickets.length
            }
        });
    } catch (error) { next(error); }
};

const getMyTickets = async (req, res, next) => {
    try {
        const tickets = await Ticket.findAll({
            where: { status: 'active', userId: req.userId },
            order: [['entryTime', 'DESC']],
            attributes: ['id', 'ticketNumber', 'plateNumber', 'vehicleType', 'entryTime', 'barcodeData']
        });
        res.json({
            success: true,
            data: {
                tickets: tickets.map(t => ({
                    id: t.id, ticketNumber: t.ticketNumber, plateNumber: t.plateNumber,
                    vehicleType: t.vehicleType, entryTime: t.entryTime, barcodeData: t.barcodeData
                })),
                total: tickets.length
            }
        });
    } catch (error) { next(error); }
};

const printTicket = async (req, res, next) => {
    try {
        const { identifier } = req.params;
        let ticket;
        if (/^\d+$/.test(identifier)) {
            ticket = await Ticket.findByPk(identifier);
        } else {
            ticket = await Ticket.findOne({ where: { ticketNumber: identifier } });
        }
        if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });

        const [parkingName, parkingAddress] = await Promise.all([
            Setting.get('parking_name', 'ParkHere'),
            Setting.get('parking_address', '')
        ]);

        await ActivityLog.create({
            userId: req.userId, action: 'TICKET_REPRINTED', entityType: 'ticket', entityId: ticket.id,
            details: { ticketNumber: ticket.ticketNumber, plateNumber: ticket.plateNumber }, ipAddress: req.ip
        });

        res.json({
            success: true, message: 'Tiket siap dicetak',
            data: {
                id: ticket.id, ticketNumber: ticket.ticketNumber, plateNumber: ticket.plateNumber,
                vehicleType: ticket.vehicleType, entryTime: ticket.entryTime,
                barcodeData: ticket.barcodeData,
                formattedDuration: formatDuration(ticket.entryTime), parkingName, parkingAddress
            }
        });
    } catch (error) { next(error); }
};

const markTicketLost = async (req, res, next) => {
    try {
        const { identifier } = req.params;
        const { verificationMethod, notes } = req.body;
        let ticket;
        if (/^\d+$/.test(identifier)) {
            ticket = await Ticket.findByPk(identifier);
        } else {
            ticket = await Ticket.findOne({ where: { plateNumber: identifier.toUpperCase(), status: 'active' } });
        }
        if (!ticket) return res.status(404).json({ success: false, message: 'Tiket aktif tidak ditemukan' });

        await ticket.update({ status: 'lost', notes: `LOST - ${verificationMethod || 'Manual'}\n${notes || ''}` });
        await ActivityLog.log({
            userId: req.userId, action: 'TICKET_MARKED_LOST', entityType: 'ticket', entityId: ticket.id,
            details: { ticketNumber: ticket.ticketNumber, verificationMethod }, ipAddress: req.ip
        });
        res.json({ success: true, message: 'Tiket berhasil ditandai sebagai hilang', data: { ticket } });
    } catch (error) { next(error); }
};

const cancelTicket = async (req, res, next) => {
    try {
        const { id } = req.params;
        const ticket = await Ticket.findByPk(id);
        if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });

        await ActivityLog.create({
            userId: req.userId, action: 'TICKET_DELETED', entityType: 'ticket', entityId: ticket.id,
            details: { ticketNumber: ticket.ticketNumber, plateNumber: ticket.plateNumber, status: ticket.status },
            ipAddress: req.ip
        });
        await ticket.destroy();
        res.json({ success: true, message: 'Tiket berhasil dihapus', data: { deletedTicketNumber: ticket.ticketNumber } });
    } catch (error) { next(error); }
};

function formatDuration(entryTime) {
    const minutes = Math.floor((Date.now() - new Date(entryTime).getTime()) / 60000);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function calculateCost(durationMinutes, rate) {
    const grace = rate.gracePeriodMinutes || 0;
    if (durationMinutes <= grace) return 0;
    const hours = Math.ceil((durationMinutes - grace) / 60);
    let cost = hours * parseFloat(rate.ratePerHour);
    if (rate.dailyMax && cost > parseFloat(rate.dailyMax)) cost = parseFloat(rate.dailyMax);
    return Math.round(cost);
}

module.exports = {
    createTicket, getTicket, searchTickets, getActiveTickets, getMyTickets,
    printTicket, markTicketLost, cancelTicket, createTicketValidation, calculateCost
};