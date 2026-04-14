import { useEffect, useRef, useCallback } from 'react';

/**
 * Reusable Ticket Print Component
 * 
 * Props:
 *   ticket       - { ticketNumber, plateNumber, vehicleType, entryTime, parkingSpot, barcodeData }
 *   parkingInfo  - { name, address }
 *   autoPrint    - if true, prints immediately via hidden iframe (no new tab)
 *   trigger      - increment this number to trigger a manual print
 *   onPrintDone  - callback after print is triggered
 */

const VEHICLE_LABELS = {
    car: 'Mobil',
    motorcycle: 'Motor',
};

function formatTimeWIB(date) {
    return new Date(date).toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function formatDateWIB(date) {
    return new Date(date).toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function buildTicketHTML(ticket, parkingInfo) {
    const time = formatTimeWIB(ticket.entryTime);
    const date = formatDateWIB(ticket.entryTime);
    const vehicleLabel = VEHICLE_LABELS[ticket.vehicleType] || ticket.vehicleType;
    const pName = parkingInfo?.name || 'ParkHere';
    const pAddr = parkingInfo?.address || '';
    const barcodeValue = ticket.ticketNumber || '';

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${barcodeValue}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;width:76mm;padding:3mm 4mm 4mm;background:#fff;color:#222;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.center{text-align:center}
.park-name{font-size:15px;font-weight:800;letter-spacing:.4px;margin-bottom:.5mm;color:#111}
.park-addr{font-size:7.5px;color:#666;margin-bottom:2mm}
.divider{border:none;border-top:1.5px solid #222;margin:2mm 0}
.divider-dash{border:none;border-top:1px dashed #aaa;margin:2mm 0}
.title{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#444;margin-bottom:1mm}
.ticket-num{font-size:20px;font-weight:900;letter-spacing:2px;color:#111;margin:1mm 0}
.info-grid{width:100%;border-collapse:collapse;margin:1.5mm 0}
.info-grid td{font-size:8.5px;padding:1.2mm 0;vertical-align:top}
.info-grid td:first-child{color:#777;width:35%}
.info-grid td:last-child{font-weight:600;text-align:right;color:#222}
.barcode-section{margin-top:3mm;padding-top:2mm;border-top:1px dashed #aaa;text-align:center}
.barcode-section svg{display:block;margin:0 auto}
.barcode-id{font-size:9px;font-weight:700;letter-spacing:1.5px;color:#333;margin-top:1mm;font-family:'Courier New',monospace}
.warn{font-size:6.5px;text-align:center;color:#d00;margin-top:2.5mm;padding:1.5mm 2mm;border:1px solid #faa;border-radius:2px;background:#fff5f5;font-weight:700;letter-spacing:.3px}
@media print{@page{margin:0;size:76mm auto}body{margin:0;padding:3mm 4mm 4mm}}
</style></head><body>
<div class="center">
  <div class="park-name">${pName}</div>
  ${pAddr ? `<div class="park-addr">${pAddr}</div>` : ''}
  <hr class="divider"/>
  <div class="title">Tiket Parkir Masuk</div>
  <div class="ticket-num">${barcodeValue}</div>
</div>
<hr class="divider-dash"/>
<table class="info-grid">
  <tr><td>Jenis</td><td>${vehicleLabel}</td></tr>
  <tr><td>Jam Masuk</td><td>${time} WIB</td></tr>
  <tr><td>Tanggal</td><td>${date}</td></tr>
  ${ticket.plateNumber && ticket.plateNumber !== 'UNKNOWN' ? `<tr><td>Plat</td><td>${ticket.plateNumber}</td></tr>` : ''}
  ${ticket.parkingSpot ? `<tr><td>Slot</td><td>${ticket.parkingSpot}</td></tr>` : ''}
</table>
<div class="barcode-section">
  <svg id="bc"></svg>
  <div class="barcode-id">${barcodeValue}</div>
</div>
<div class="warn">PERHATIAN: TIKET HILANG DIKENAKAN DENDA</div>
<script>
try {
  JsBarcode("#bc", ${JSON.stringify(barcodeValue)}, {
    format: "CODE128",
    width: 1.8,
    height: 48,
    displayValue: false,
    margin: 4,
    background: "#fff",
    lineColor: "#000"
  });
} catch(e) { console.error('Barcode error', e); }
<\/script>
</body></html>`;
}

export function printTicketViaIframe(ticket, parkingInfo, onDone) {
    const html = buildTicketHTML(ticket, parkingInfo);

    // Remove any previous print iframe
    const existing = document.getElementById('ticket-print-iframe');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'ticket-print-iframe';
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const triggerPrint = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error('Print failed:', e);
        }
        setTimeout(() => {
            iframe.remove();
            if (onDone) onDone();
        }, 1500);
    };

    let attempts = 0;
    const checkJsBarcode = () => {
        if (iframe.contentWindow && iframe.contentWindow.JsBarcode) {
            triggerPrint();
        } else if (attempts < 50) {
            attempts++;
            setTimeout(checkJsBarcode, 100); // Retry every 100ms, up to 5 seconds
        } else {
            console.warn('JsBarcode CDN timeout, printing anyway');
            triggerPrint(); // Force print after timeout
        }
    };

    checkJsBarcode();
}

export default function TicketPrint({ ticket, parkingInfo, autoPrint = false, trigger = 0, onPrintDone }) {
    const hasPrinted = useRef(false);
    const lastTrigger = useRef(0);

    const doPrint = useCallback(() => {
        if (!ticket) return;
        printTicketViaIframe(ticket, parkingInfo, onPrintDone);
    }, [ticket, parkingInfo, onPrintDone]);

    // Auto-print on mount (for AutoEntry)
    useEffect(() => {
        if (autoPrint && ticket && !hasPrinted.current) {
            hasPrinted.current = true;
            doPrint();
        }
    }, [autoPrint, ticket, doPrint]);

    // Manual trigger (for Entry / ActiveTickets reprint)
    useEffect(() => {
        if (trigger > 0 && trigger !== lastTrigger.current) {
            lastTrigger.current = trigger;
            doPrint();
        }
    }, [trigger, doPrint]);

    // This component renders nothing visible
    return null;
}
