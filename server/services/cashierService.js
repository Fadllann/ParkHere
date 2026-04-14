const { sequelize, CashierLog } = require('../models');

/**
 * Current net balance: sum(income) - sum(outcome). Optional transaction for locking consistency.
 */
async function getRunningNet(outerTransaction) {
    const opts = outerTransaction ? { transaction: outerTransaction } : {};
    const [row] = await CashierLog.findAll({
        attributes: [
            [
                sequelize.fn(
                    'COALESCE',
                    sequelize.fn(
                        'SUM',
                        sequelize.literal(
                            "CASE WHEN type = 'income' THEN amount ELSE -amount END"
                        )
                    ),
                    0
                ),
                'net'
            ]
        ],
        raw: true,
        ...opts
    });
    return parseFloat(row?.net ?? 0) || 0;
}

function deltaForType(type, amount) {
    const n = parseFloat(amount);
    return type === 'income' ? n : -n;
}

/**
 * Create a ledger row with balanceAfter inside a transaction.
 */
async function createLedgerRow(values, outerTransaction) {
    const run = async (t) => {
        const net = await getRunningNet(t);
        const delta = deltaForType(values.type, values.amount);
        const balanceAfter = net + delta;
        const row = await CashierLog.create(
            {
                ...values,
                balanceAfter
            },
            { transaction: t }
        );
        return row;
    };
    if (outerTransaction) {
        return run(outerTransaction);
    }
    return sequelize.transaction(run);
}

/**
 * Idempotent income from payment (findOrCreate by paymentId).
 * Returns { row, created }.
 */
async function recordIncomeFromPayment({
    payment,
    createdBy,
    description,
    referenceId
}) {
    const amount = parseFloat(payment.amount);
    return sequelize.transaction(async (t) => {
        const existing = await CashierLog.findOne({
            where: { paymentId: payment.id },
            transaction: t
        });
        if (existing) {
            return { row: existing, created: false };
        }
        const net = await getRunningNet(t);
        const balanceAfter = net + amount;
        const row = await CashierLog.create(
            {
                type: 'income',
                source: 'payment',
                amount,
                description: description || null,
                referenceId: referenceId || String(payment.id),
                createdBy: createdBy || null,
                paymentId: payment.id,
                balanceAfter
            },
            { transaction: t }
        );
        return { row, created: true };
    });
}

/**
 * Recompute balanceAfter for all rows in chronological order (id).
 */
async function recomputeAllBalances(outerTransaction) {
    const run = async (t) => {
        const rows = await CashierLog.findAll({
            order: [['id', 'ASC']],
            transaction: t
        });
        let net = 0;
        for (const r of rows) {
            net += deltaForType(r.type, r.amount);
            await r.update({ balanceAfter: net }, { transaction: t });
        }
    };
    if (outerTransaction) {
        return run(outerTransaction);
    }
    return sequelize.transaction(run);
}

module.exports = {
    getRunningNet,
    createLedgerRow,
    recordIncomeFromPayment,
    recomputeAllBalances,
    deltaForType
};
