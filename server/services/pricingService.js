const { Rate } = require('../models');

/**
 * Calculate parking fee based on duration and vehicle type
 * @param {number} durationMinutes - Parking duration in minutes
 * @param {string} vehicleType - Vehicle type (car, motorcycle, truck, suv)
 * @param {boolean} isLostTicket - Whether this is a lost ticket
 * @returns {Object} - Calculation details
 */
const calculateParkingFee = async (durationMinutes, vehicleType, isLostTicket = false) => {
    const rate = await Rate.getActiveRate(vehicleType);

    if (!rate) {
        throw new Error(`No active rate found for vehicle type: ${vehicleType}`);
    }

    const gracePeriod = rate.gracePeriodMinutes || 0;

    // Lost ticket: apply fixed penalty
    if (isLostTicket && rate.lostTicketFee) {
        return {
            amount: parseFloat(rate.lostTicketFee),
            formattedAmount: formatCurrency(rate.lostTicketFee),
            breakdown: {
                type: 'lost_ticket_fee',
                lostTicketFee: parseFloat(rate.lostTicketFee)
            },
            rate: {
                ratePerHour: parseFloat(rate.ratePerHour),
                dailyMax: rate.dailyMax ? parseFloat(rate.dailyMax) : null,
                gracePeriodMinutes: gracePeriod
            }
        };
    }

    // Within grace period: free
    if (durationMinutes <= gracePeriod) {
        return {
            amount: 0,
            formattedAmount: 'Gratis',
            breakdown: {
                type: 'grace_period',
                gracePeriodMinutes: gracePeriod,
                durationMinutes
            },
            rate: {
                ratePerHour: parseFloat(rate.ratePerHour),
                dailyMax: rate.dailyMax ? parseFloat(rate.dailyMax) : null,
                gracePeriodMinutes: gracePeriod
            }
        };
    }

    // Calculate billable hours
    const billableMinutes = durationMinutes - gracePeriod;
    const hours = Math.ceil(billableMinutes / 60);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    let amount = 0;
    const dailyMax = rate.dailyMax ? parseFloat(rate.dailyMax) : null;
    const hourlyRate = parseFloat(rate.ratePerHour);

    if (days > 0 && dailyMax) {
        // Calculate full days at daily max + remaining hours
        amount = (days * dailyMax) + (remainingHours * hourlyRate);

        // Cap remaining hours at daily max
        const remainingAmount = remainingHours * hourlyRate;
        if (remainingAmount > dailyMax) {
            amount = (days + 1) * dailyMax;
        }
    } else {
        amount = hours * hourlyRate;

        // Apply daily max if exceeded
        if (dailyMax && amount > dailyMax) {
            amount = dailyMax;
        }
    }

    amount = Math.round(amount);

    return {
        amount,
        formattedAmount: formatCurrency(amount),
        breakdown: {
            type: 'standard',
            durationMinutes,
            billableMinutes,
            billableHours: hours,
            days,
            remainingHours,
            hourlyRate,
            dailyMax,
            gracePeriodMinutes: gracePeriod
        },
        rate: {
            ratePerHour: hourlyRate,
            dailyMax,
            gracePeriodMinutes: gracePeriod
        }
    };
};

/**
 * Get all active rates
 * @returns {Array} - List of active rates
 */
const getAllRates = async () => {
    const rates = await Rate.findAll({
        where: { isActive: true },
        order: [['vehicleType', 'ASC']]
    });

    return rates.map(r => ({
        id: r.id,
        vehicleType: r.vehicleType,
        ratePerHour: parseFloat(r.ratePerHour),
        formattedRatePerHour: formatCurrency(r.ratePerHour),
        dailyMax: r.dailyMax ? parseFloat(r.dailyMax) : null,
        formattedDailyMax: r.dailyMax ? formatCurrency(r.dailyMax) : null,
        gracePeriodMinutes: r.gracePeriodMinutes,
        lostTicketFee: r.lostTicketFee ? parseFloat(r.lostTicketFee) : null,
        formattedLostTicketFee: r.lostTicketFee ? formatCurrency(r.lostTicketFee) : null
    }));
};

/**
 * Update rate for vehicle type
 * @param {string} vehicleType 
 * @param {Object} rateData 
 */
const updateRate = async (vehicleType, rateData) => {
    const [rate, created] = await Rate.findOrCreate({
        where: { vehicleType, isActive: true },
        defaults: {
            ...rateData,
            effectiveFrom: new Date()
        }
    });

    if (!created) {
        await rate.update(rateData);
    }

    return rate;
};

/**
 * Format number as Indonesian Rupiah
 * @param {number} amount 
 * @returns {string}
 */
const formatCurrency = (amount) => {
    return `Rp. ${parseFloat(amount).toLocaleString('id-ID')}`;
};

/**
 * Format duration as human-readable string
 * @param {number} minutes 
 * @returns {string}
 */
const formatDuration = (minutes) => {
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
};

module.exports = {
    calculateParkingFee,
    getAllRates,
    updateRate,
    formatCurrency,
    formatDuration
};
