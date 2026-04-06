import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Webcam from 'react-webcam';
import Navbar from '../components/common/Navbar';
import { ticketService } from '../services/api';
import { showSuccess, showError, closeLoading } from '../utils/alerts';

/* ─────────────────────────────────────────────
   STATUS MACHINE
   idle → capturing → reading → creating → done
───────────────────────────────────────────── */
const STATUS = {
    IDLE: 'idle',
    CAPTURING: 'capturing',
    READING: 'reading',
    CREATING: 'creating',
    DONE: 'done',
};

const VEHICLE_TYPES = [
    { value: 'motorcycle', label: 'Motor', icon: 'fa-motorcycle', accent: '#f59e0b' },
    { value: 'car', label: 'Mobil', icon: 'fa-car', accent: '#3b82f6' },
    { value: 'suv', label: 'SUV', icon: 'fa-car-side', accent: '#8b5cf6' },
    { value: 'truck', label: 'Truk', icon: 'fa-truck', accent: '#10b981' },
];

/* ─────────────────────────────────────────────
   PLATE RECOGNITION  via OpenALPR Cloud API
   Docs: https://doc.openalpr.com/#cloudapi
   Set your secret key in the constant below,
   or expose it via  VITE_OPENALPR_KEY  in .env
   Falls back to 'UNKNOWN' on any error.
───────────────────────────────────────────── */
const OPENALPR_KEY = import.meta.env.VITE_OPENALPR_KEY || 'YOUR_OPENALPR_SECRET_KEY';
const OPENALPR_COUNTRY = 'id';   // Indonesian plates  (use 'us', 'eu', etc. otherwise)
const OPENALPR_URL = 'https://api.openalpr.com/v3/recognize_bytes';

async function recognizePlate(imageBase64) {
    try {
        // OpenALPR expects raw base64 — strip the data-URI prefix if present
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

        const res = await fetch(
            `${OPENALPR_URL}?secret_key=${OPENALPR_KEY}&recognize_vehicle=0&country=${OPENALPR_COUNTRY}&return_image=0`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: base64Data,
            }
        );

        if (!res.ok) throw new Error(`OpenALPR HTTP ${res.status}`);

        const json = await res.json();

        // json.results is an array sorted by confidence (highest first)
        if (json.results?.length > 0) {
            // plate string is already upper-case from the API
            return json.results[0].plate.replace(/\s+/g, ' ').trim() || 'UNKNOWN';
        }

        return 'UNKNOWN';
    } catch (err) {
        console.error('[OpenALPR]', err);
        return 'UNKNOWN';
    }
}

/* ─────────────────────────────────────────────
   AUTO PRINT
───────────────────────────────────────────── */
function autoPrint(ticket, parkingInfo) {
    const labels = { car: 'Mobil', motorcycle: 'Sepeda Motor', suv: 'SUV', truck: 'Truk' };
    const vehicleLabel = labels[ticket.vehicleType] || ticket.vehicleType;
    const d = new Date(ticket.entryTime);
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(ticket.qrCodeData || ticket.ticketNumber)}`;

    const win = window.open('', '', 'width=400,height=600');
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Tiket ${ticket.ticketNumber}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;background:#fff;width:80mm;padding:5mm}
  .h{font-size:13px;font-weight:bold;text-align:center;margin-bottom:1mm}
  .sub{font-size:7.5px;text-align:center;color:#555;margin-bottom:2mm}
  .title{font-size:10px;text-align:center;font-weight:bold;border-bottom:1.5px solid #000;padding-bottom:1.5mm;margin-bottom:3mm;letter-spacing:1px}
  .qr{display:flex;flex-direction:column;align-items:center;margin-bottom:4mm;background:#fafafa;padding:3mm}
  .qr img{width:45mm;height:45mm;border:2px solid #333;padding:1mm;background:#fff}
  .no{font-size:14px;font-weight:bold;text-align:center;letter-spacing:2px;margin:2mm 0 1mm}
  .scan{font-size:7.5px;text-align:center;color:#555;font-style:italic}
  hr{border:none;border-bottom:1px solid #999;margin:2.5mm 0}
  hr.d{border-bottom-style:dashed}
  .row{display:flex;justify-content:space-between;margin:1.5mm 0;padding:.5mm 0;border-bottom:.5px solid #ddd;font-size:8.5px}
  .lbl{font-weight:bold;color:#444}.val{text-align:right;font-weight:500}
  .note{font-size:7px;text-align:center;color:#e74c3c;margin-top:2mm;font-weight:bold;padding:1mm;background:#ffebeb}
  @media print{body{margin:0;box-shadow:none}}
</style></head><body>
  <div class="h">${parkingInfo.name}</div>
  ${parkingInfo.address ? `<div class="sub">${parkingInfo.address}</div>` : ''}
  <div class="title">TIKET PARKIR</div>
  <div class="qr">
    <img src="${qrUrl}" alt="QR"/>
    <div class="no">${ticket.ticketNumber}</div>
    <div class="scan">Pindai atau tunjukkan saat keluar</div>
  </div>
  <hr/>
  <div class="row"><span class="lbl">Plat:</span><span class="val">${ticket.plateNumber}</span></div>
  <div class="row"><span class="lbl">Jenis:</span><span class="val">${vehicleLabel}</span></div>
  <div class="row"><span class="lbl">Masuk:</span><span class="val">${time}</span></div>
  <div class="row"><span class="lbl">Tgl:</span><span class="val">${date}</span></div>
  <hr class="d"/>
  <div class="note">Hilang = Dikenakan Biaya Tambahan</div>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
const AutoEntry = () => {
    const [status, setStatus] = useState(STATUS.IDLE);
    const [cameraReady, setCameraReady] = useState(false);
    const [lastTicket, setLastTicket] = useState(null);
    const [plateResult, setPlateResult] = useState('');
    const [capturedImg, setCapturedImg] = useState(null);
    const [activeVehicle, setActiveVehicle] = useState(null);
    const [parkingInfo, setParkingInfo] = useState({ name: 'Smart Parking', address: '' });
    const webcamRef = useRef(null);
    const resetTimer = useRef(null);

    /* auto-reset to idle after "done" */
    useEffect(() => {
        if (status === STATUS.DONE) {
            resetTimer.current = setTimeout(() => {
                setStatus(STATUS.IDLE);
                setPlateResult('');
                setCapturedImg(null);
                setActiveVehicle(null);
            }, 4000);
        }
        return () => clearTimeout(resetTimer.current);
    }, [status]);

    const handleVehicleSelect = useCallback(async (vehicle) => {
        if (status !== STATUS.IDLE || !cameraReady) return;

        setActiveVehicle(vehicle.value);

        /* 1. Capture frame */
        setStatus(STATUS.CAPTURING);
        const imageSrc = webcamRef.current?.getScreenshot({ width: 1280, height: 720 });
        if (!imageSrc) {
            showError('Kamera tidak siap. Coba lagi.');
            setStatus(STATUS.IDLE);
            return;
        }
        setCapturedImg(imageSrc);

        /* 2. OCR plate number */
        setStatus(STATUS.READING);
        const plate = await recognizePlate(imageSrc);
        setPlateResult(plate);

        /* 3. Create ticket + upload image */
        setStatus(STATUS.CREATING);
        try {
            const response = await ticketService.create({
                plateNumber: plate,
                vehicleType: vehicle.value,
                capturedImage: imageSrc,      // base64 JPEG
            });

            closeLoading();

            if (response.data.success) {
                const ticket = response.data.data.ticket;
                const pInfo = {
                    name: response.data.data.parkingName || 'Smart Parking',
                    address: response.data.data.parkingAddress || '',
                };
                setLastTicket(ticket);
                setParkingInfo(pInfo);
                setStatus(STATUS.DONE);
                showSuccess(`Tiket dibuat – Plat: ${ticket.plateNumber}`);
                autoPrint(ticket, pInfo);
            } else {
                showError(response.data.message || 'Gagal membuat tiket');
                setStatus(STATUS.IDLE);
            }
        } catch (err) {
            closeLoading();
            showError(err.response?.data?.message || 'Gagal membuat tiket');
            setStatus(STATUS.IDLE);
        }
    }, [status, cameraReady]);

    /* ── status copy ── */
    const statusMeta = {
        [STATUS.IDLE]: { text: 'Siap – Pilih jenis kendaraan', dot: '#10b981' },
        [STATUS.CAPTURING]: { text: 'Mengambil foto…', dot: '#f59e0b' },
        [STATUS.READING]: { text: 'Membaca plat nomor…', dot: '#3b82f6' },
        [STATUS.CREATING]: { text: 'Membuat & mencetak tiket…', dot: '#8b5cf6' },
        [STATUS.DONE]: { text: `Tiket tercetak – ${plateResult}`, dot: '#10b981' },
    };
    const meta = statusMeta[status];

    return (
        <div style={styles.root}>
            <Navbar />

            <div style={styles.body}>

                {/* ── Left: camera + status ── */}
                <div style={styles.cameraCol}>
                    <div style={styles.cameraHeader}>
                        <span style={styles.camLabel}>
                            <i className="fas fa-video" style={{ marginRight: 8 }} />
                            KAMERA MASUK
                        </span>
                        <span style={{ ...styles.camDot, background: cameraReady ? '#10b981' : '#ef4444' }} />
                    </div>

                    <div style={styles.cameraWrap}>
                        <Webcam
                            ref={webcamRef}
                            audio={false}
                            screenshotFormat="image/jpeg"
                            screenshotQuality={0.92}
                            videoConstraints={{ facingMode: 'environment', width: 1280, height: 720 }}
                            onUserMedia={() => setCameraReady(true)}
                            onUserMediaError={() => setCameraReady(false)}
                            style={styles.webcam}
                        />

                        {/* scan line animation */}
                        {(status === STATUS.CAPTURING || status === STATUS.READING) && (
                            <div style={styles.scanLine} />
                        )}

                        {/* captured preview flash */}
                        {capturedImg && status !== STATUS.IDLE && (
                            <div style={styles.captureFlash}>
                                <img src={capturedImg} alt="captured" style={styles.captureImg} />
                                <span style={styles.captureTag}>FOTO TERSIMPAN</span>
                            </div>
                        )}

                        {/* corner brackets */}
                        {['tl', 'tr', 'bl', 'br'].map(c => (
                            <div key={c} style={{ ...styles.corner, ...styles[c] }} />
                        ))}
                    </div>

                    {/* status bar */}
                    <div style={styles.statusBar}>
                        <span style={{ ...styles.statusDot, background: meta.dot }} />
                        <span style={styles.statusText}>{meta.text}</span>
                    </div>

                    {/* last ticket summary */}
                    {lastTicket && status === STATUS.DONE && (
                        <div style={styles.ticketBadge}>
                            <div style={styles.tbRow}>
                                <span style={styles.tbLabel}>No. Tiket</span>
                                <span style={styles.tbValue}>{lastTicket.ticketNumber}</span>
                            </div>
                            <div style={styles.tbRow}>
                                <span style={styles.tbLabel}>Plat</span>
                                <span style={styles.tbValue}>{lastTicket.plateNumber}</span>
                            </div>
                            <div style={styles.tbRow}>
                                <span style={styles.tbLabel}>Masuk</span>
                                <span style={styles.tbValue}>
                                    {new Date(lastTicket.entryTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right: vehicle buttons ── */}
                <div style={styles.btnCol}>
                    <div style={styles.btnHeading}>
                        <div style={styles.btnHeadingLine} />
                        <span style={styles.btnHeadingText}>JENIS KENDARAAN</span>
                        <div style={styles.btnHeadingLine} />
                    </div>

                    <div style={styles.btnGrid}>
                        {VEHICLE_TYPES.map((v) => {
                            const isActive = activeVehicle === v.value && status !== STATUS.IDLE;
                            const isDisabled = status !== STATUS.IDLE || !cameraReady;
                            return (
                                <button
                                    key={v.value}
                                    onClick={() => handleVehicleSelect(v)}
                                    disabled={isDisabled}
                                    style={{
                                        ...styles.vBtn,
                                        '--accent': v.accent,
                                        borderColor: isActive ? v.accent : 'rgba(255,255,255,0.08)',
                                        background: isActive
                                            ? `${v.accent}22`
                                            : 'rgba(255,255,255,0.03)',
                                        opacity: isDisabled && !isActive ? 0.45 : 1,
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        boxShadow: isActive ? `0 0 24px ${v.accent}44` : 'none',
                                        transform: isActive ? 'scale(1.02)' : 'scale(1)',
                                    }}
                                >
                                    <div style={{ ...styles.vIconWrap, background: `${v.accent}1a`, borderColor: `${v.accent}44` }}>
                                        <i
                                            className={`fas ${v.icon}`}
                                            style={{ fontSize: 36, color: isActive ? v.accent : '#cbd5e1' }}
                                        />
                                    </div>
                                    <span style={{ ...styles.vLabel, color: isActive ? v.accent : '#e2e8f0' }}>
                                        {v.label}
                                    </span>
                                    {isActive && (
                                        <span style={styles.vProcessing}>
                                            <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />
                                            {status === STATUS.CAPTURING ? 'Memotret…'
                                                : status === STATUS.READING ? 'Membaca plat…'
                                                    : status === STATUS.CREATING ? 'Mencetak…'
                                                        : 'Selesai!'}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <p style={styles.hint}>
                        <i className="fas fa-hand-pointer" style={{ marginRight: 6, opacity: 0.5 }} />
                        Tekan tombol sesuai jenis kendaraan untuk mencetak tiket secara otomatis
                    </p>

                    <Link to="/" style={styles.backLink}>
                        <i className="fas fa-arrow-left" style={{ marginRight: 6 }} />
                        Kembali ke Beranda
                    </Link>
                </div>
            </div>

            <style>{`
                @keyframes scanMove {
                    0%   { top: 0 }
                    100% { top: 100% }
                }
                @keyframes fadeFlash {
                    0%   { opacity:0; transform:scale(0.96) }
                    15%  { opacity:1; transform:scale(1) }
                    80%  { opacity:1 }
                    100% { opacity:0 }
                }
            `}</style>
        </div>
    );
};

/* ─────────────────────────────────────────────
   STYLES  (dark industrial kiosk)
───────────────────────────────────────────── */
const styles = {
    root: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0c10 0%, #0d1117 60%, #0f1419 100%)',
        color: '#e2e8f0',
        fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace",
    },
    body: {
        display: 'flex',
        gap: 28,
        padding: '24px 32px 32px',
        maxWidth: 1280,
        margin: '0 auto',
        alignItems: 'flex-start',
    },

    /* camera column */
    cameraCol: {
        flex: '1 1 60%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    cameraHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.07)',
    },
    camLabel: {
        fontSize: 11,
        letterSpacing: '0.12em',
        color: '#94a3b8',
        fontWeight: 600,
    },
    camDot: {
        width: 10,
        height: 10,
        borderRadius: '50%',
        display: 'inline-block',
        boxShadow: '0 0 6px currentColor',
    },
    cameraWrap: {
        position: 'relative',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        background: '#000',
        aspectRatio: '16/9',
    },
    webcam: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
    },
    scanLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 2,
        background: 'linear-gradient(90deg, transparent 0%, #3b82f6 50%, transparent 100%)',
        boxShadow: '0 0 12px #3b82f680',
        animation: 'scanMove 1.4s linear infinite',
        zIndex: 10,
    },
    captureFlash: {
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        animation: 'fadeFlash 3s ease forwards',
    },
    captureImg: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    captureTag: {
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#10b981',
        color: '#000',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        padding: '4px 12px',
        borderRadius: 4,
    },
    /* corner brackets */
    corner: {
        position: 'absolute',
        width: 20,
        height: 20,
        zIndex: 5,
        pointerEvents: 'none',
    },
    tl: { top: 10, left: 10, borderTop: '2px solid #3b82f6', borderLeft: '2px solid #3b82f6' },
    tr: { top: 10, right: 10, borderTop: '2px solid #3b82f6', borderRight: '2px solid #3b82f6' },
    bl: { bottom: 10, left: 10, borderBottom: '2px solid #3b82f6', borderLeft: '2px solid #3b82f6' },
    br: { bottom: 10, right: 10, borderBottom: '2px solid #3b82f6', borderRight: '2px solid #3b82f6' },

    statusBar: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        flexShrink: 0,
        boxShadow: '0 0 6px currentColor',
    },
    statusText: {
        fontSize: 12,
        color: '#94a3b8',
        letterSpacing: '0.04em',
    },

    ticketBadge: {
        padding: '14px 16px',
        background: 'rgba(16,185,129,0.08)',
        border: '1px solid rgba(16,185,129,0.25)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    tbRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    tbLabel: { fontSize: 11, color: '#64748b', letterSpacing: '0.06em' },
    tbValue: { fontSize: 13, fontWeight: 700, color: '#10b981', letterSpacing: '0.05em' },

    /* button column */
    btnCol: {
        flex: '0 0 340px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        paddingTop: 2,
    },
    btnHeading: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },
    btnHeadingLine: {
        flex: 1,
        height: 1,
        background: 'rgba(255,255,255,0.08)',
    },
    btnHeadingText: {
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.18em',
        color: '#475569',
        whiteSpace: 'nowrap',
    },
    btnGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
    },
    vBtn: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '22px 16px',
        border: '1px solid',
        borderRadius: 14,
        transition: 'all 0.2s ease',
        outline: 'none',
        position: 'relative',
        overflow: 'hidden',
    },
    vIconWrap: {
        width: 72,
        height: 72,
        borderRadius: 12,
        border: '1px solid',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    vLabel: {
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: '0.04em',
        transition: 'color 0.2s',
    },
    vProcessing: {
        fontSize: 10,
        color: '#94a3b8',
        letterSpacing: '0.06em',
    },

    hint: {
        fontSize: 11,
        color: '#334155',
        textAlign: 'center',
        lineHeight: 1.6,
        padding: '0 8px',
    },
    backLink: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        color: '#475569',
        textDecoration: 'none',
        marginTop: 4,
        transition: 'color 0.2s',
    },
};

export default AutoEntry;