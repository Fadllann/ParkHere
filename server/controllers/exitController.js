const { Ticket, Payment, Rate, ActivityLog } = require('../models');
const barcodeService = require('../services/barcodeService');

function calculateParking(durationMinutes, rate) {
    let hours = Math.ceil(durationMinutes / 60);
    if (hours === 0) hours = 1;
    
    const cost = hours * rate.ratePerHour;
    if (rate.dailyMax && cost > rate.dailyMax) {
        return rate.dailyMax;
    }
    return cost;
}

const exitTicket = async (req, res, next) => {
    try {
        const { ticketNumber, plateNumber, barcodeData } = req.body;
        
        let ticket;
        
        // Find ticket by ticket number, plate number, or barcode
        if (barcodeData) {
            const verified = barcodeService.verifyTicketBarcode(barcodeData);
            if (!verified) {
                return res.status(403).json({
                    success: false,
                    message: 'Invalid or tampered barcode'
                });
            }
            ticket = await Ticket.findOne({
                where: { ticketNumber: verified.t, status: 'active' }
            });
        } else if (ticketNumber) {
            ticket = await Ticket.findOne({
                where: { ticketNumber, status: 'active' }
            });
        } else if (plateNumber) {
            ticket = await Ticket.findOne({
                where: { plateNumber, status: 'active' }
            });
        }

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found or already exited'
            });
        }

        const exitTime = new Date();
        const durationMinutes = Math.floor((exitTime - ticket.entryTime) / (1000 * 60));
        
        const rate = await Rate.findOne({
            where: { vehicleType: ticket.vehicleType, isActive: true }
        });

        if (!rate) {
            return res.status(400).json({
                success: false,
                message: 'Rate not found for vehicle type'
            });
        }

        const cost = calculateParking(durationMinutes, rate);

        await ticket.update({
            exitTime,
            status: 'completed'
        });

        const payment = await Payment.create({
            ticketId: ticket.id,
            amount: cost,
            durationMinutes,
            paymentMethod: 'pending',
            status: 'pending'
        });

        await ActivityLog.log({
            userId: req.userId || null,
            action: 'TICKET_EXIT',
            entityType: 'ticket',
            entityId: ticket.id,
            details: {
                ticketNumber: ticket.ticketNumber,
                durationMinutes,
                cost
            },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Exit recorded successfully',
            data: {
                ticket: {
                    ticketNumber: ticket.ticketNumber,
                    plateNumber: ticket.plateNumber,
                    entryTime: ticket.entryTime,
                    exitTime,
                    durationMinutes,
                    vehicleType: ticket.vehicleType
                },
                payment: {
                    id: payment.id,
                    amount: cost,
                    currency: 'IDR'
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    exitTicket
};