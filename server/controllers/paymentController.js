const { body, param } = require('express-validator');
const {
    sequelize,
    Ticket,
    Payment,
    Rate,
    ActivityLog,
    PlateCapture,
    Setting,
    CashierLog,
    User
} = require('../models');
const barcodeService = require('../services/barcodeService');
const imageService = require('../services/imageService');
const pricingService = require('../services/pricingService');
const cashierService = require('../services/cashierService');

// Validation rules
const processPaymentValidation = [
    body('ticketId')
        .optional({ nullable: true })
        .custom((value, { req }) => {
            // Lost-ticket flow does not have a real ticket row yet.
            if (req.body?.isLostTicket) return true;
            if (value === undefined || value === null || value === '') {
                throw new Error('Tiket ID wajib diisi');
            }
            if (!Number.isInteger(Number(value))) {
                throw new Error('Tiket ID tidak valid');
            }
            return true;
        }),
    body('paymentMethod')
        .isIn(['cash', 'card', 'digital'])
        .withMessage('Metode pembayaran tidak valid'),
    body('amountPaid')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Jumlah pembayaran harus positif'),
    body('captureImageExit')
        .optional()
        .isString()
        .withMessage('Foto keluar harus berupa string yang valid (base64)'),
    body('notes')
        .optional()
        .trim(),
    body('isWorkerFree')
        .optional()
        .isBoolean()
        .withMessage('Flag gratis karyawan harus berupa boolean')
];

// Calculate parking fee (GET query and/or POST JSON body)
const calculateFee = async (req, res, next) => {
    try {
        const source = {
            ...req.query,
            ...(req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {})
        };
        const { ticketId, ticketNumber, plateNumber, barcodeData } = source;

        let ticket;

        if (ticketId) {
            ticket = await Ticket.findByPk(ticketId);
        } else if (barcodeData) {
            const verified = barcodeService.verifyTicketBarcode(barcodeData);
            if (!verified) {
                return res.status(403).json({
                    success: false,
                    message: 'Invalid barcode data'
                });
            }
            ticket = await Ticket.findOne({ where: { ticketNumber: verified.t } });
        } else if (ticketNumber) {
            ticket = await Ticket.findOne({ where: { ticketNumber } });
        } else if (plateNumber) {
            ticket = await Ticket.findOne({
                where: {
                    plateNumber: plateNumber.toUpperCase().replace(/\s+/g, ''),
                    status: 'active'
                }
            });
        }

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Tiket tidak ditemukan'
            });
        }

        if (ticket.status !== 'active' && ticket.status !== 'lost') {
            return res.status(400).json({
                success: false,
                message: 'Tiket sudah diproses'
            });
        }

        // Get rate
        const rate = await Rate.getActiveRate(ticket.vehicleType);

        if (!rate) {
            return res.status(500).json({
                success: false,
                message: 'Tidak ada tarif aktif yang dikonfigurasi untuk tipe kendaraan ini'
            });
        }

        const exitTime = new Date();
        const durationMinutes = Math.ceil((exitTime - ticket.entryTime) / (1000 * 60));

        const fee = await pricingService.calculateParkingFee(
            durationMinutes,
            ticket.vehicleType,
            ticket.status === 'lost'
        );
        const amount = fee.amount;

        res.json({
            success: true,
            data: {
                ticket: {
                    id: ticket.id,
                    ticketNumber: ticket.ticketNumber,
                    plateNumber: ticket.plateNumber,
                    vehicleType: ticket.vehicleType,
                    entryTime: ticket.entryTime,
                    status: ticket.status
                },
                calculation: {
                    exitTime,
                    durationMinutes,
                    formattedDuration: formatDuration(durationMinutes),
                    ratePerHour: rate.ratePerHour,
                    gracePeriodMinutes: rate.gracePeriodMinutes,
                    dailyMax: rate.dailyMax,
                    isLostTicket: ticket.status === 'lost',
                    lostTicketFee: ticket.status === 'lost' ? rate.lostTicketFee : null,
                    amount,
                    formattedAmount: fee.formattedAmount
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// Process payment
const processPayment = async (req, res, next) => {
    try {
        const { ticketId, paymentMethod, amountPaid, notes, captureImageExit, isLostTicket, vehicleType, isWorkerFree } = req.body;

        // Handle lost ticket flow
        if (isLostTicket && vehicleType) {
            // Lost ticket - create payment without existing ticket
            const rate = await Rate.getActiveRate(vehicleType);
            if (!rate) {
                return res.status(500).json({
                    success: false,
                    message: 'Tidak ada tarif aktif yang dikonfigurasi untuk tipe kendaraan ini'
                });
            }

            // Determine lost ticket fee: use per-vehicle fee if available, otherwise use global
            let lostTicketFeeAmount = rate.lostTicketFee;
            if (!lostTicketFeeAmount) {
                const globalFee = await Setting.get('globalLostTicketFee', 200000);
                lostTicketFeeAmount = parseInt(globalFee);
            }

            let payment;
            const { row: ftLost, created: ftLostCreated } = await sequelize.transaction(async (t) => {
                payment = await Payment.create(
                    {
                        ticketId: null,
                        amount: lostTicketFeeAmount,
                        paymentMethod,
                        durationMinutes: null,
                        rateApplied: 0,
                        operatorId: req.userId || null,
                        paidAt: new Date(),
                        notes: `Lost ticket - ${vehicleType}`,
                        isLostTicket: true,
                        lostTicketFee: lostTicketFeeAmount,
                        vehicleType: vehicleType
                    },
                    { transaction: t }
                );
                return cashierService.recordIncomeFromPayment({
                    payment,
                    createdBy: req.userId,
                    description: `Lost ticket — ${vehicleType}`,
                    referenceId: String(payment.id),
                    transaction: t
                });
            });

            // Log activity
            await ActivityLog.log({
                userId: req.userId,
                action: 'LOST_TICKET_PAYMENT',
                entityType: 'payment',
                entityId: payment.id,
                details: {
                    vehicleType,
                    amount: lostTicketFeeAmount,
                    paymentMethod
                },
                ipAddress: req.ip
            });

            if (ftLostCreated) {
                await ActivityLog.log({
                    userId: req.userId,
                    action: 'PAYMENT_INCOME',
                    entityType: 'cashier_log',
                    entityId: ftLost.id,
                    details: {
                        amount: parseFloat(payment.amount),
                        type: 'income',
                        referenceId: String(payment.id),
                        paymentId: payment.id,
                        cashierLogId: ftLost.id
                    },
                    ipAddress: req.ip
                });
            }

            return res.json({
                success: true,
                message: 'Tiket hilang berhasil diproses',
                data: {
                    payment: {
                        id: payment.id,
                        amount: payment.amount,
                        formattedAmount: `Rp. ${payment.amount.toLocaleString('id-ID')}`,
                        paymentMethod: payment.paymentMethod,
                        paidAt: payment.paidAt,
                        isLostTicket: true
                    }
                }
            });
        }

        // Normal ticket payment flow
        const ticket = await Ticket.findByPk(ticketId, {
            include: [{ model: Payment, as: 'payment' }]
        });

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Tiket tidak ditemukan'
            });
        }

        if (ticket.payment) {
            return res.status(400).json({
                success: false,
                message: 'Tiket sudah dibayar'
            });
        }

        if (ticket.status !== 'active' && ticket.status !== 'lost') {
            return res.status(400).json({
                success: false,
                message: 'Tiket tidak dapat diproses'
            });
        }

        // Get rate and calculate
        const rate = await Rate.getActiveRate(ticket.vehicleType);

        if (!rate) {
            return res.status(500).json({
                success: false,
                message: 'Tidak ada tarif aktif yang dikonfigurasi untuk tipe kendaraan ini'
            });
        }

        const exitTime = new Date();
        const durationMinutes = Math.ceil((exitTime - ticket.entryTime) / (1000 * 60));
        const fee = await pricingService.calculateParkingFee(
            durationMinutes,
            ticket.vehicleType,
            ticket.status === 'lost'
        );
        const finalAmount = isWorkerFree ? 0 : fee.amount;
        const normalizedNotes = isWorkerFree
            ? `[WORKER_FREE] ${notes ? String(notes).trim() : 'Gratis karyawan'}`
            : (notes ? String(notes).trim() : null);

        let payment;
        const { row: ftRow, created: ftCreated } = await sequelize.transaction(async (t) => {
            payment = await Payment.create(
                {
                    ticketId: ticket.id,
                    amount: finalAmount,
                    paymentMethod,
                    durationMinutes,
                    rateApplied: rate.ratePerHour,
                    operatorId: req.userId || null,
                    paidAt: new Date(),
                    notes: normalizedNotes
                },
                { transaction: t }
            );

            await ticket.update(
                {
                    status: 'paid',
                    exitTime
                },
                { transaction: t }
            );

            return cashierService.recordIncomeFromPayment({
                payment,
                createdBy: req.userId,
                description: normalizedNotes || `Payment — ${ticket.ticketNumber}`,
                referenceId: ticket.ticketNumber,
                transaction: t
            });
        });

        // Save exit image if provided (best-effort after payment commits)
        if (captureImageExit) {
            try {
                const exitImagePath = imageService.saveBase64Image(captureImageExit, 'exit');
                await ticket.update({ exitImagePath });

                // Create PlateCapture record for exit image
                await PlateCapture.create({
                    ticketId: ticket.id,
                    plateNumber: ticket.plateNumber,
                    imagePath: exitImagePath,
                    captureType: 'exit',
                    capturedAt: new Date()
                });
            } catch (imageError) {
                console.error('Error saving exit image:', imageError);
                // Don't fail payment if image save fails; just log it
            }
        }

        // Log activity
        await ActivityLog.log({
            userId: req.userId,
            action: 'PAYMENT_PROCESSED',
            entityType: 'payment',
            entityId: payment.id,
            details: {
                ticketNumber: ticket.ticketNumber,
                amount: finalAmount,
                paymentMethod,
                durationMinutes,
                isWorkerFree: !!isWorkerFree
            },
            ipAddress: req.ip
        });

        if (ftCreated) {
            await ActivityLog.log({
                userId: req.userId,
                action: 'PAYMENT_INCOME',
                entityType: 'cashier_log',
                entityId: ftRow.id,
                details: {
                    amount: parseFloat(payment.amount),
                    type: 'income',
                    referenceId: ticket.ticketNumber,
                    paymentId: payment.id,
                    cashierLogId: ftRow.id
                },
                ipAddress: req.ip
            });
        }

        res.json({
            success: true,
            message: 'Pembayaran berhasil diproses',
            data: {
                payment: {
                    id: payment.id,
                    amount: payment.amount,
                    formattedAmount: `Rp. ${payment.amount.toLocaleString('id-ID')}`,
                    paymentMethod: payment.paymentMethod,
                    durationMinutes: payment.durationMinutes,
                    formattedDuration: formatDuration(durationMinutes),
                    paidAt: payment.paidAt,
                    isWorkerFree: !!isWorkerFree
                },
                ticket: {
                    ticketNumber: ticket.ticketNumber,
                    plateNumber: ticket.plateNumber,
                    vehicleType: ticket.vehicleType,
                    entryTime: ticket.entryTime,
                    exitTime: ticket.exitTime,
                    status: ticket.status
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// Get payment by I
const getPayment = async (req, res, next) => {
    try {
        const { identifier } = req.params;

        let payment;

        if (/^\d+$/.test(identifier)) {
            payment = await Payment.findByPk(identifier, {
                include: [{ model: Ticket, as: 'ticket' }]
            });
        } else {
            payment = await Payment.findOne({
                where: { receiptNumber: identifier },
                include: [{ model: Ticket, as: 'ticket' }]
            });
        }

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Pembayaran tidak ditemukan'
            });
        }

        res.json({
            success: true,
            data: {
                payment: {
                    ...payment.toJSON(),
                    formattedAmount: `Rp. ${payment.amount.toLocaleString('id-ID')}`,
                    formattedDuration: formatDuration(payment.durationMinutes)
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// Get payment history
const getPaymentHistory = async (req, res, next) => {
    try {
        const { fromDate, toDate, paymentMethod, page = 1, limit = 20 } = req.query;

        const where = {};

        if (fromDate) {
            where.paidAt = { ...where.paidAt, [require('sequelize').Op.gte]: new Date(fromDate) };
        }
        if (toDate) {
            where.paidAt = { ...where.paidAt, [require('sequelize').Op.lte]: new Date(toDate) };
        }
        if (paymentMethod) {
            where.paymentMethod = paymentMethod;
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows: payments } = await Payment.findAndCountAll({
            where,
            include: [{
                model: Ticket,
                as: 'ticket',
                attributes: ['ticketNumber', 'plateNumber', 'vehicleType', 'entryImagePath', 'exitImagePath']
            }],
            order: [['paidAt', 'DESC']],
            limit: parseInt(limit),
            offset
        });

        // Calculate totals
        const totals = await Payment.findAll({
            where,
            attributes: [
                [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalAmount'],
                [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'totalCount']
            ],
            raw: true
        });

        res.json({
            success: true,
            data: {
                payments: payments.map(p => ({
                    ...p.toJSON(),
                    formattedAmount: `Rp. ${parseFloat(p.amount).toLocaleString('id-ID')}`,
                    formattedDuration: formatDuration(p.durationMinutes)
                })),
                summary: {
                    totalAmount: parseFloat(totals[0]?.totalAmount || 0),
                    formattedTotalAmount: `Rp. ${parseFloat(totals[0]?.totalAmount || 0).toLocaleString('id-ID')}`,
                    totalTransactions: parseInt(totals[0]?.totalCount || 0)
                },
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / parseInt(limit))
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// Helper: Format duration
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return `${days} hari ${remainingHours} jam ${mins} menit`;
    }

    if (hours > 0) {
        return `${hours} jam ${mins} menit`;
    }

    return `${mins} menit`;
}

const refundPaymentValidation = [
    param('id').isInt().withMessage('Payment ID tidak valid'),
    body('amount').isFloat({ gt: 0 }).withMessage('Jumlah refund harus lebih besar dari 0'),
    body('description').optional().isString().trim()
];

const refundPayment = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const payment = await Payment.findByPk(id);
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Pembayaran tidak ditemukan' });
        }

        const amount = parseFloat(req.body.amount);
        const paid = parseFloat(payment.amount);
        if (amount > paid) {
            return res.status(400).json({
                success: false,
                message: `Jumlah refund tidak boleh melebihi jumlah pembayaran (${paid})`
            });
        }

        const referenceId = `refund:payment:${id}:${Date.now()}`;
        const row = await cashierService.createCashierLog({
            type: 'outcome',
            source: 'refund',
            amount,
            description: req.body.description || `Refund for payment #${id}`,
            referenceId,
            paymentId: null,
            createdBy: req.userId || null
        });

        await ActivityLog.log({
            userId: req.userId,
            action: 'REFUND_OUTCOME',
            entityType: 'cashier_log',
            entityId: row.id,
            details: {
                amount,
                type: 'outcome',
                referenceId,
                paymentId: id
            },
            ipAddress: req.ip
        });

        const full = await CashierLog.findByPk(row.id, {
            include: [
                { model: User, as: 'creator', attributes: ['id', 'username', 'fullName'] },
                {
                    model: Payment,
                    as: 'payment',
                    required: false,
                    include: [{ model: Ticket, as: 'ticket', attributes: ['ticketNumber'] }]
                }
            ]
        });

        const j = full.toJSON();
        res.json({
            success: true,
            message: 'Refund berhasil dicatat',
            data: {
                transaction: {
                    ...j,
                    amount: parseFloat(j.amount),
                    balanceAfter: j.balanceAfter != null ? parseFloat(j.balanceAfter) : null,
                    formattedAmount: `Rp. ${parseFloat(j.amount).toLocaleString('id-ID')}`
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    calculateFee,
    processPayment,
    getPayment,
    getPaymentHistory,
    processPaymentValidation,
    refundPayment,
    refundPaymentValidation
};
