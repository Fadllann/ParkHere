import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Webcam from 'react-webcam';
import Navbar from '../components/common/Navbar';
import TicketPrint, { printTicketViaIframe } from '../components/common/TicketPrint';
import { ticketService } from '../services/api';
import { showSuccess, showError } from '../utils/alerts';

const STATUS = {
    IDLE:     'idle',
    SNAP:     'snap',
    CREATING: 'creating',
    DONE:     'done',
};

const VEHICLES = [
    { value: 'motorcycle', label: 'Motor', color: '#f59e0b', iconClass: 'fa-motorcycle' },
    { value: 'car',        label: 'Mobil', color: '#38bdf8', iconClass: 'fa-car' },
];

function toWIB(date) {
    return new Date(date).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit', minute: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour12: false
    });
}

// Queue
const jobQueue = [];
let queueRunning = false;

async function drainQueue(onQueueChange) {
    if (queueRunning) return;
    queueRunning = true;
    while (jobQueue.length > 0) {
        const job = jobQueue[0];
        try { await job(); } catch (e) { console.error('[Queue]', e); }
        jobQueue.shift();
        onQueueChange(jobQueue.length);
    }
    queueRunning = false;
}


export default function AutoEntry() {
    const [status,        setStatus]       = useState(STATUS.IDLE);
    const [camReady,      setCamReady]     = useState(false);
    const [snapshot,      setSnapshot]     = useState(null);
    const [activeV,       setActiveV]      = useState(null);
    const [lastTicket,    setLastTicket]   = useState(null);
    const [parkingInfo,   setParkingInfo]  = useState({ name: 'ParkHere', address: '' });
    const [queueLen,      setQueueLen]     = useState(0);

    const webcamRef  = useRef(null);
    const resetTimer = useRef(null);

    useEffect(() => {
        if (status === STATUS.DONE) {
            resetTimer.current = setTimeout(() => {
                setStatus(STATUS.IDLE);
                setSnapshot(null);
                setActiveV(null);
            }, 3500);
        }
        return () => clearTimeout(resetTimer.current);
    }, [status]);

    // Ticket creation
    const handleVehicle = useCallback((v) => {
        if (!camReady) { showError('Kamera belum siap.'); return; }

        const img = webcamRef.current?.getScreenshot({ width: 1280, height: 720, quality: 0.92 });
        if (!img) { showError('Gagal mengambil foto.'); return; }

        setSnapshot(img);
        setActiveV(v.value);
        setStatus(STATUS.SNAP);

        jobQueue.push(async () => {
            setStatus(STATUS.CREATING);
            try {
                const res = await ticketService.create({ vehicleType: v.value, capturedImage: img });
                if (res.data.success) {
                    const ticket = res.data.data.ticket;
                    const pInfo  = {
                        name:    res.data.data.parkingName    || 'ParkHere',
                        address: res.data.data.parkingAddress || '',
                    };
                    setLastTicket(ticket);
                    setParkingInfo(pInfo);
                    setStatus(STATUS.DONE);
                    showSuccess(`Tiket ${ticket.ticketNumber} dibuat`);
                    // Print using reusable component - in current tab via iframe
                    printTicketViaIframe(ticket, pInfo);
                } else {
                    showError(res.data.message || 'Gagal membuat tiket');
                    setStatus(STATUS.IDLE);
                }
            } catch (err) {
                showError(err.response?.data?.message || 'Gagal membuat tiket');
                setStatus(STATUS.IDLE);
            }
        });

        setQueueLen(jobQueue.length);
        drainQueue(setQueueLen);
    }, [camReady]);

    const statusInfo = {
        [STATUS.IDLE]:     { label: 'Siap',              color: '#10b981', pulse: false },
        [STATUS.SNAP]:     { label: 'Mengambil foto…',   color: '#f59e0b', pulse: true  },
        [STATUS.CREATING]: { label: 'Membuat tiket…',    color: '#38bdf8', pulse: true  },
        [STATUS.DONE]:     { label: 'Tiket dicetak',     color: '#10b981', pulse: false },
    };
    const si = statusInfo[status];

    return (
        <div style={S.root}>
            <Navbar />

            <div style={S.page}>
                {/* left: camera */}
                <div style={S.left}>

                    {/* Camera header */}
                    <div style={S.camHeader}>
                        <div style={S.camHeaderLeft}>
                            <span style={{ ...S.dot, background: camReady ? '#10b981' : '#ef4444',
                                boxShadow: `0 0 8px ${camReady ? '#10b981' : '#ef4444'}` }} />
                            <span style={S.camTitle}>KAMERA MASUK</span>
                        </div>
                        <div style={S.camHeaderRight}>
                            {queueLen > 0 && (
                                <span style={S.queuePill}>
                                    <span style={S.queueDot} />
                                    Antrian: {queueLen}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Camera feed */}
                    <div style={S.camWrap}>
                        <Webcam
                            ref={webcamRef}
                            audio={false}
                            screenshotFormat="image/jpeg"
                            screenshotQuality={0.92}
                            videoConstraints={{ facingMode: 'environment', width: 1280, height: 720 }}
                            onUserMedia={() => setCamReady(true)}
                            onUserMediaError={() => setCamReady(false)}
                            style={S.webcam}
                        />

                        {/* Scan animation */}
                        {(status === STATUS.SNAP || status === STATUS.CREATING) && (
                            <div style={S.scanBar} />
                        )}

                        {/* Snapshot flash */}
                        {snapshot && status !== STATUS.IDLE && (
                            <div style={S.flash}>
                                <img src={snapshot} alt="" style={S.flashImg} />
                                <div style={S.flashBadge}>TERSIMPAN</div>
                            </div>
                        )}

                        {/* Corner guides */}
                        {[S.cTL, S.cTR, S.cBL, S.cBR].map((cs, i) => (
                            <div key={i} style={{ ...S.corner, ...cs }} />
                        ))}

                        {/* Plate zone hint */}
                        <div style={S.plateZone}>
                            <span style={S.plateZoneLabel}>AREA PLAT NOMOR</span>
                        </div>
                    </div>

                    {/* Status bar */}
                    <div style={{ ...S.statusBar, borderColor: si.color + '44', background: si.color + '11' }}>
                        <span style={{ ...S.statusDot, background: si.color,
                            animation: si.pulse ? 'pulse 1s ease-in-out infinite' : 'none' }} />
                        <span style={{ ...S.statusLabel, color: si.color }}>{si.label}</span>
                        {status === STATUS.DONE && lastTicket && (
                            <span style={S.statusTicketId}>{lastTicket.ticketNumber}</span>
                        )}
                    </div>

                    {/* Last ticket summary */}
                    {lastTicket && status === STATUS.DONE && (
                        <div style={S.summary}>
                            <div style={S.summaryRow}>
                                <span style={S.summaryLabel}>No. Tiket</span>
                                <span style={S.summaryValue}>{lastTicket.ticketNumber}</span>
                            </div>
                            <div style={S.summaryRow}>
                                <span style={S.summaryLabel}>Kendaraan</span>
                                <span style={S.summaryValue}>
                                    {VEHICLES.find(v => v.value === lastTicket.vehicleType)?.label || lastTicket.vehicleType}
                                </span>
                            </div>
                            <div style={S.summaryRow}>
                                <span style={S.summaryLabel}>Masuk (WIB)</span>
                                <span style={S.summaryValue}>{toWIB(lastTicket.entryTime)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* right: vehicle buttons */}
                <div style={S.right}>
                    <div style={S.rightHeader}>
                        <span style={S.rightTitle}>JENIS KENDARAAN</span>
                        <span style={S.rightSub}>Ketuk untuk cetak tiket otomatis</span>
                    </div>

                    <div style={S.grid}>
                        {VEHICLES.map(v => {
                            const active   = activeV === v.value && status !== STATUS.IDLE;
                            const disabled = !camReady;
                            return (
                                <button
                                    key={v.value}
                                    onClick={() => handleVehicle(v)}
                                    disabled={disabled}
                                    style={{
                                        ...S.vCard,
                                        borderColor:  active ? v.color : 'rgba(255,255,255,0.07)',
                                        background:   active ? `${v.color}18` : 'rgba(255,255,255,0.03)',
                                        boxShadow:    active ? `0 0 28px ${v.color}33, inset 0 0 20px ${v.color}0a` : 'none',
                                        transform:    active ? 'scale(1.03)' : 'scale(1)',
                                        opacity:      disabled ? 0.4 : 1,
                                        cursor:       disabled ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    <span style={S.vIcon} aria-hidden>
                                        <i className={`fas ${v.iconClass}`} style={{ color: active ? v.color : '#94a3b8' }} />
                                    </span>
                                    <span style={{ ...S.vLabel, color: active ? v.color : '#cbd5e1' }}>{v.label}</span>
                                    {active && (
                                        <span style={{ ...S.vState, color: v.color }}>
                                            {status === STATUS.SNAP && (
                                                <><i className="fas fa-camera" style={{ marginRight: 4 }} aria-hidden />Memotret</>
                                            )}
                                            {status === STATUS.CREATING && (
                                                <><i className="fas fa-print" style={{ marginRight: 4 }} aria-hidden />Mencetak</>
                                            )}
                                            {status === STATUS.DONE && (
                                                <><i className="fas fa-check" style={{ marginRight: 4 }} aria-hidden />Selesai</>
                                            )}
                                        </span>
                                    )}
                                    <div style={{ ...S.vAccentLine, background: v.color, opacity: active ? 1 : 0 }} />
                                </button>
                            );
                        })}
                    </div>

                    <Link to="/" style={S.back}>
                        <i className="fas fa-arrow-left" style={{ marginRight: 8 }} aria-hidden />
                        Kembali ke Beranda
                    </Link>
                </div>
            </div>

            <style>{`
                @keyframes scanMove { 0%{top:-4px} 100%{top:100%} }
                @keyframes flash    { 0%{opacity:0;transform:scale(.97)} 10%{opacity:1;transform:scale(1)} 75%{opacity:1} 100%{opacity:0} }
                @keyframes pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.85)} }
            `}</style>
        </div>
    );
}

const S = {
    root: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)',
        color: '#e2e8f0',
        fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
    },
    page: {
        display: 'flex', gap: 24,
        padding: '20px 28px 32px',
        maxWidth: 1100, margin: '0 auto',
        alignItems: 'flex-start',
    },
    left: { flex: '1 1 60%', display: 'flex', flexDirection: 'column', gap: 10 },
    camHeader: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
    },
    camHeaderLeft:  { display: 'flex', alignItems: 'center', gap: 8 },
    camHeaderRight: { display: 'flex', alignItems: 'center', gap: 8 },
    dot: { width: 9, height: 9, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
    camTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#94a3b8' },
    queuePill: {
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 600,
        background: '#f59e0b18', color: '#f59e0b',
        border: '1px solid #f59e0b33',
        borderRadius: 20, padding: '3px 10px',
    },
    queueDot: {
        width: 6, height: 6, borderRadius: '50%',
        background: '#f59e0b', animation: 'pulse 1s ease-in-out infinite',
    },
    camWrap: {
        position: 'relative', borderRadius: 14, overflow: 'hidden',
        background: '#000', aspectRatio: '16/9',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 4px 40px rgba(0,0,0,0.5)',
    },
    webcam: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    scanBar: {
        position: 'absolute', left: 0, right: 0, height: 3, zIndex: 10,
        background: 'linear-gradient(90deg,transparent,#38bdf8,transparent)',
        boxShadow: '0 0 16px rgba(56,189,248,0.6)',
        animation: 'scanMove 1.6s ease-in-out infinite',
    },
    flash:    { position: 'absolute', inset: 0, zIndex: 20, animation: 'flash 3.5s ease forwards' },
    flashImg: { width: '100%', height: '100%', objectFit: 'cover' },
    flashBadge: {
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        background: '#10b981', color: '#000',
        fontSize: 11, fontWeight: 800, letterSpacing: '.1em',
        padding: '5px 14px', borderRadius: 5,
        boxShadow: '0 2px 12px #10b98166',
    },
    corner: { position: 'absolute', width: 22, height: 22, zIndex: 6, pointerEvents: 'none' },
    cTL: { top: 12, left: 12,  borderTop:    '2.5px solid #38bdf8', borderLeft:   '2.5px solid #38bdf8' },
    cTR: { top: 12, right: 12, borderTop:    '2.5px solid #fbbf24', borderRight:  '2.5px solid #fbbf24' },
    cBL: { bottom: 12, left: 12,  borderBottom: '2.5px solid #fbbf24', borderLeft:   '2.5px solid #fbbf24' },
    cBR: { bottom: 12, right: 12, borderBottom: '2.5px solid #38bdf8', borderRight:  '2.5px solid #38bdf8' },
    plateZone: {
        position: 'absolute', top: '25%', height: '45%', left: '3%', right: '3%', zIndex: 5,
        border: '2px dashed rgba(56,189,248,0.6)',
        borderRadius: 4, padding: '6px 0',
        textAlign: 'center',
        background: 'rgba(56,189,248,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    plateZoneLabel: { fontSize: 10, color: 'rgba(147,197,253,0.8)', letterSpacing: '.12em', fontWeight: 600 },
    statusBar: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 9,
        border: '1px solid',
        transition: 'all 0.3s',
    },
    statusDot:      { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
    statusLabel:    { fontSize: 12, fontWeight: 600, letterSpacing: '.03em' },
    statusTicketId: {
        marginLeft: 'auto', fontSize: 13, fontWeight: 800,
        letterSpacing: '.1em', color: '#10b981',
    },
    summary: {
        padding: '14px 16px',
        background: 'rgba(16,185,129,0.07)',
        border: '1px solid rgba(16,185,129,0.2)',
        borderRadius: 10,
    },
    summaryRow:   { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 },
    summaryLabel: { color: '#64748b' },
    summaryValue: { fontWeight: 700, color: '#e2e8f0' },
    right: {
        flex: '0 0 340px', display: 'flex', flexDirection: 'column', gap: 18,
    },
    rightHeader: { display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 2 },
    rightTitle:  { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: '#475569' },
    rightSub:    { fontSize: 10, color: '#334155' },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    vCard: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, padding: '20px 12px 14px',
        border: '1px solid', borderRadius: 14,
        transition: 'all 0.22s ease',
        outline: 'none', cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
    },
    vIcon:  { fontSize: 32, lineHeight: 1, color: '#94a3b8' },
    vLabel: { fontSize: 13, fontWeight: 700, letterSpacing: '.02em', transition: 'color 0.2s' },
    vState: { fontSize: 9, fontWeight: 600, letterSpacing: '.05em' },
    vAccentLine: {
        position: 'absolute', bottom: 0, left: '20%', right: '20%',
        height: 2, borderRadius: 2, transition: 'opacity 0.2s',
    },
    back: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: '#334155', textDecoration: 'none',
        padding: '10px', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.06)',
        transition: 'color 0.2s',
    },
    overlay: {
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    modal: {
        width: '100%', maxWidth: 480,
        background: '#0f1520', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '24px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
    },
    modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    modalTitle:  { fontSize: 16, fontWeight: 700, color: '#e2e8f0' },
    modalClose:  {
        background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8',
        width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14,
    },
    modalDesc: { fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 1.6 },
    code: { background: 'rgba(56,189,248,0.12)', color: '#7dd3fc', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' },
    searchRow: { display: 'flex', gap: 8, marginBottom: 12 },
    searchInput: {
        flex: 1, padding: '10px 12px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8, color: '#e2e8f0', fontSize: 14,
        fontFamily: 'monospace', outline: 'none',
        letterSpacing: '.05em',
    },
    searchBtn: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '10px 16px', borderRadius: 8,
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        color: '#fff',
        border: '1px solid rgba(251,191,36,0.25)', cursor: 'pointer',
        fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
    },
    printBtn: {
        marginTop: 12, width: '100%', padding: '10px',
        background: 'rgba(16,185,129,0.15)',
        border: '1px solid rgba(16,185,129,0.35)',
        color: '#10b981', borderRadius: 8,
        cursor: 'pointer', fontSize: 13, fontWeight: 700,
    },
};