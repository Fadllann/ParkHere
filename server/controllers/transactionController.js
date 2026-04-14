const { body, param } = require('express-validator');
const { CashierLog, User, Payment, ActivityLog, Ticket, sequelize } = require('../models');
const cashierService = require('../services/cashierService');

const includeList = () => [
    {
        model: User,
        as: 'creator',
        attributes: ['id', 'username', 'fullName']
    },
    {
        model: Payment,
        as: 'payment',
        required: false,
        include: [
            {
                model: Ticket,
                as: 'ticket',
                attributes: ['ticketNumber', 'plateNumber', 'vehicleType', 'exitImagePath']
            }
        ]
    }
];

function formatMoney(n) {
    const v = parseFloat(n) || 0;
    return `Rp. ${v.toLocaleString('id-ID')}`;
}

function formatRow(t) {
    const j = t.toJSON();
    return {
        ...j,
        amount: parseFloat(j.amount),
        balanceAfter: j.balanceAfter != null ? parseFloat(j.balanceAfter) : null,
        formattedAmount: formatMoney(j.amount),
        formattedBalanceAfter: j.balanceAfter != null ? formatMoney(j.balanceAfter) : null
    };
}

const createValidation = [
    body('type').isIn(['income', 'outcome']).withMessage('Invalid type'),
    body('amount').isFloat({ gt: 0 }).withMessage('Nominal harus lebih besar dari 0'),
    body('source')
        .isIn(['expense', 'manual', 'refund'])
        .withMessage('Sumber harus salah satu dari: expense, manual, refund'),
    body('description').optional().isString().trim(),
    body('referenceId').optional().isString().isLength({ max: 64 })
];

const updateValidation = [
    param('id').isInt().withMessage('Invalid id'),
    body('type').optional().isIn(['income', 'outcome']).withMessage('Invalid type'),
    body('amount').optional().isFloat({ gt: 0 }).withMessage('Nominal harus lebih besar dari 0'),
    body('description').optional().isString().trim(),
    body('referenceId').optional().isString().isLength({ max: 64 })
];

const deleteValidation = [param('id').isInt().withMessage('Invalid id')];

const getTransactions = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const typeFilter = req.query.type;

        const where = {};
        if (typeFilter === 'income' || typeFilter === 'outcome') {
            where.type = typeFilter;
        }

        const offset = (page - 1) * limit;

        const count = await CashierLog.count({ where });
        const rows = await CashierLog.findAll({
            where,
            include: includeList(),
            order: [['createdAt', 'DESC'], ['id', 'DESC']],
            limit,
            offset
        });

        const [totals] = await CashierLog.findAll({
            attributes: [
                [
                    sequelize.fn(
                        'COALESCE',
                        sequelize.fn(
                            'SUM',
                            sequelize.literal(
                                "CASE WHEN type = 'income' THEN amount ELSE 0 END"
                            )
                        ),
                        0
                    ),
                    'totalIncome'
                ],
                [
                    sequelize.fn(
                        'COALESCE',
                        sequelize.fn(
                            'SUM',
                            sequelize.literal(
                                "CASE WHEN type = 'outcome' THEN amount ELSE 0 END"
                            )
                        ),
                        0
                    ),
                    'totalOutcome'
                ]
            ],
            raw: true
        });

        const totalIncome = parseFloat(totals?.totalIncome ?? 0) || 0;
        const totalOutcome = parseFloat(totals?.totalOutcome ?? 0) || 0;
        const netBalance = totalIncome - totalOutcome;

        res.json({
            success: true,
            data: {
                transactions: rows.map(formatRow),
                summary: {
                    totalIncome,
                    totalOutcome,
                    netBalance,
                    formattedTotalIncome: formatMoney(totalIncome),
                    formattedTotalOutcome: formatMoney(totalOutcome),
                    formattedNetBalance: formatMoney(netBalance)
                },
                pagination: {
                    total: count,
                    page,
                    limit,
                    totalPages: Math.ceil(count / limit) || 1
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

const createTransaction = async (req, res, next) => {
    try {
        const { type, amount, source, description, referenceId } = req.body;

        const row = await cashierService.createLedgerRow({
            type,
            amount: parseFloat(amount),
            source,
            description: description || null,
            referenceId: referenceId || null,
            paymentId: null,
            createdBy: req.userId || null
        });

        await ActivityLog.log({
            userId: req.userId,
            action: 'CREATE_TRANSACTION',
            entityType: 'cashier_log',
            entityId: row.id,
            details: {
                amount: parseFloat(row.amount),
                type: row.type,
                referenceId: row.referenceId,
                source: row.source
            },
            ipAddress: req.ip
        });

        const full = await CashierLog.findByPk(row.id, { include: includeList() });

        res.status(201).json({
            success: true,
            data: { transaction: formatRow(full) }
        });
    } catch (err) {
        next(err);
    }
};

const updateTransaction = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const row = await CashierLog.findByPk(id);
        if (!row) {
            return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
        }
        if (row.paymentId != null) {
            return res.status(403).json({
                success: false,
                message: 'Tidak dapat mengedit yang dihasilkan dari pembayaran'
            });
        }

        const { type, amount, description, referenceId } = req.body;
        const updates = {};
        if (description !== undefined) updates.description = description;
        if (referenceId !== undefined) updates.referenceId = referenceId;
        if (amount !== undefined) updates.amount = parseFloat(amount);
        if (type !== undefined) {
            if (row.source === 'refund') {
                updates.type = type;
            } else if (row.source === 'manual' || row.source === 'expense') {
                updates.type = type;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Tidak dapat mengubah tipe untuk sumber ini'
                });
            }
        }

        await row.update(updates);
        await cashierService.recomputeAllBalances();

        await ActivityLog.log({
            userId: req.userId,
            action: 'UPDATE_TRANSACTION',
            entityType: 'cashier_log',
            entityId: row.id,
            details: {
                amount: parseFloat(row.amount),
                type: row.type,
                referenceId: row.referenceId,
                source: row.source
            },
            ipAddress: req.ip
        });

        const full = await CashierLog.findByPk(id, { include: includeList() });
        res.json({ success: true, data: { transaction: formatRow(full) } });
    } catch (err) {
        next(err);
    }
};

const deleteTransaction = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const row = await CashierLog.findByPk(id);
        if (!row) {
            return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
        }
        if (row.paymentId != null || row.source === 'payment') {
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus transaksi yang terkait dengan pembayaran'
            });
        }

        await row.destroy();
        await cashierService.recomputeAllBalances();

        await ActivityLog.log({
            userId: req.userId,
            action: 'DELETE_TRANSACTION',
            entityType: 'cashier_log',
            entityId: id,
            details: {
                amount: parseFloat(row.amount),
                type: row.type,
                referenceId: row.referenceId,
                source: row.source
            },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Transaksi berhasil dihapus' });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    createValidation,
    updateValidation,
    deleteValidation
};
