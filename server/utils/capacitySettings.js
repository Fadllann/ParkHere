const { Setting } = require('../models');

/**
 * Per-vehicle-type caps. Falls back to legacy `max_capacity` when split keys are unset.
 */
async function getParkingCapacityLimits() {
    const legacyRaw = await Setting.get('max_capacity', 100);
    const legacy = Math.max(1, parseInt(legacyRaw, 10) || 100);

    const carRaw = await Setting.get('max_capacity_car', null);
    const motoRaw = await Setting.get('max_capacity_motorcycle', null);

    const maxCar = carRaw != null && carRaw !== ''
        ? parseInt(carRaw, 10)
        : legacy;
    const maxMoto = motoRaw != null && motoRaw !== ''
        ? parseInt(motoRaw, 10)
        : legacy;

    return {
        maxCapacityCar: Number.isFinite(maxCar) && maxCar > 0 ? maxCar : legacy,
        maxCapacityMotorcycle: Number.isFinite(maxMoto) && maxMoto > 0 ? maxMoto : legacy
    };
}

module.exports = { getParkingCapacityLimits };
