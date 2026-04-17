import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Quagga from '@ericblade/quagga2';
import Webcam from 'react-webcam';
import { adminService, paymentService, ticketService } from '../services/api';
import { showSuccess, showError, showLoading, closeLoading, showConfirm } from '../utils/alerts';

const Exit = () => {
    const location = useLocation();
    const [step, setStep] = useState(1); // 1: Search/Scan, 2: Payment Cashier, 3: Receipt
    const [searchQuery, setSearchQuery] = useState('');
    const [searchMode, setSearchMode] = useState('ticket'); // 'ticket' or 'plate'
    const [ticket, setTicket] = useState(null);
    const [calculation, setCalculation] = useState(null);
    const [payment, setPayment] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    // Exit Photo Capture States
    const [showExitCamera, setShowExitCamera] = useState(false);
    const [exitPhotoBase64, setExitPhotoBase64] = useState(null);
    const exitWebcamRef = useRef(null);

    // Lost Ticket States
    const [isLostTicket, setIsLostTicket] = useState(false);
    const [selectedLostVehicleType, setSelectedLostVehicleType] = useState(null);
    const [lostTicketFeeAmount, setLostTicketFeeAmount] = useState(0);
    const [lostTicketFees, setLostTicketFees] = useState({
        car: null,
        motorcycle: null,
        global: 200000,
        loaded: false
    });

    // Cashier States
    const [cashReceived, setCashReceived] = useState('');
    const [change, setChange] = useState(0);
    const [paymentNotes, setPaymentNotes] = useState('');
    const [isWorkerFree, setIsWorkerFree] = useState(false);

    const amountInputRef = useRef(null);
    const lastDetectionRef = useRef(null);
    const detectionDebounceMs = 500; // Debounce period in milliseconds

    // Handle pre-populated ticket from navigation state
    useEffect(() => {
        if (location.state?.preselectedTicketNumber) {
            setSearchQuery(location.state.preselectedTicketNumber);
            setSearchMode('ticket');
        }
    }, [location.state]);

    useEffect(() => {
        if (showScanner) {
            Quagga.init(
                {
                    inputStream: {
                        name: 'Live',
                        type: 'LiveStream',
                        target: document.querySelector('#barcode-scanner-exit'),
                        constraints: { width: 480, height: 320, facingMode: 'environment' }
                    },
                    decoder: { readers: ['code_128_reader', 'ean_reader', 'ean_8_reader'] }
                },
                (err) => {
                    if (err) {
                        console.error('Quagga error:', err);
                        showError('Gagal memulai kamera scanner');
                        return;
                    }
                    Quagga.start();
                }
            );
    
            Quagga.onDetected((result) => {
                // Debounce detection to prevent duplicate triggers
                const now = Date.now();
                if (lastDetectionRef.current && now - lastDetectionRef.current < detectionDebounceMs) {
                    return;
                }
                lastDetectionRef.current = now;

                const barcodeData = result.codeResult.code;
                console.log('Barcode detected:', barcodeData);
                setSearchQuery(barcodeData);
                handleSearchWithBarcode(barcodeData);
                Quagga.stop();
                setShowScanner(false);
            });
    
            return () => {
                Quagga.stop();
            };
        }
    }, [showScanner]);

    useEffect(() => {
        if (step === 2 && amountInputRef.current) {
            amountInputRef.current.focus();
        }
    }, [step]);

    // Fetch lost-ticket fee config once and cache in state
    useEffect(() => {
        let active = true;
        const loadLostTicketFees = async () => {
            try {
                const [ratesRes, settingsRes] = await Promise.all([
                    adminService.getRates(),
                    adminService.getSettings()
                ]);
                if (!active) return;

                const rates = ratesRes.data?.data?.rates || [];
                const settings = settingsRes.data?.data?.settings || {};
                const globalFee = parseInt(settings.globalLostTicketFee, 10) || 200000;

                const carRate = rates.find((r) => r.vehicleType === 'car');
                const motorcycleRate = rates.find((r) => r.vehicleType === 'motorcycle');

                setLostTicketFees({
                    car: parseInt(carRate?.lostTicketFee, 10) || null,
                    motorcycle: parseInt(motorcycleRate?.lostTicketFee, 10) || null,
                    global: globalFee,
                    loaded: true
                });
            } catch (error) {
                if (!active) return;
                // Keep working with fallback fee if config endpoints fail.
                setLostTicketFees((prev) => ({ ...prev, loaded: true }));
            }
        };

        loadLostTicketFees();
        return () => {
            active = false;
        };
    }, []);

    // Calculate change dynamically when cashReceived changes
    useEffect(() => {
        if (calculation && cashReceived !== '') {
            const received = parseInt(cashReceived.replace(/\D/g, ''), 10) || 0;
            const fee = calculation.amount || 0;
            const calculatedChange = received - fee;
            setChange(calculatedChange > 0 ? calculatedChange : 0);
        } else {
            setChange(0);
        }
    }, [cashReceived, calculation]);

    const handleSearchWithBarcode = async (barcodeData) => {
        setLoading(true);
        showLoading('Membaca tiket...');
    
        try {
            const params = { barcodeData };
            const response = await paymentService.calculate(params);
            closeLoading();
    
            if (response.data.success) {
                const calcTicket = response.data.data.ticket;
                setCalculation(response.data.data.calculation);
                // Fetch full ticket to get entryImagePath
                try {
                    const fullRes = await ticketService.get(calcTicket.ticketNumber);
                    setTicket(fullRes.data?.data?.ticket || calcTicket);
                } catch {
                    setTicket(calcTicket);
                }
                setStep(2);
            } else {
                showError(response.data.message);
            }
        } catch (error) {
            closeLoading();
            showError(error.response?.data?.message || 'Barcode tidak valid');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();

        if (!searchQuery.trim()) {
            showError('Masukkan nomor tiket atau plat nomor');
            return;
        }

        setLoading(true);
        showLoading('Mencari tiket...');

        try {
            const params = searchMode === 'ticket' 
                ? { ticketNumber: searchQuery.toUpperCase() }
                : { plateNumber: searchQuery.toUpperCase().replace(/\s+/g, '') };
            
            const response = await paymentService.calculate(params);
            closeLoading();

            if (response.data.success) {
                const calcTicket = response.data.data.ticket;
                setCalculation(response.data.data.calculation);
                // Fetch full ticket to get entryImagePath
                try {
                    const fullRes = await ticketService.get(calcTicket.ticketNumber);
                    setTicket(fullRes.data?.data?.ticket || calcTicket);
                } catch {
                    setTicket(calcTicket);
                }
                setStep(2);
            } else {
                showError(response.data.message);
            }
        } catch (error) {
            closeLoading();
            const message = error.response?.data?.message || 'Tiket tidak ditemukan';
            showError(message);
        } finally {
            setLoading(false);
        }
    };

    const handlePayment = async () => {
        const received = parseInt(cashReceived.replace(/\D/g, ''), 10) || 0;
        const finalAmount = isWorkerFree ? 0 : (calculation.amount || 0);
        
        if (received < finalAmount) {
            showError(`Uang diterima kurang dari total bayar! (Kurang: Rp ${(finalAmount - received).toLocaleString('id-ID')})`);
            return;
        }

        const result = await showConfirm(
            'Lanjutkan pembayaran tunai untuk tiket ini?',
            'Konfirmasi Pembayaran',
            'Bayar',
            'Batal'
        );

        if (!result.isConfirmed) return;

        setLoading(true);
        showLoading('Memproses pembayaran...');

        try {
            const paymentPayload = {
                ticketId: ticket.id,
                paymentMethod: 'cash',
                amountPaid: received,
                notes: paymentNotes?.trim() || null,
                isLostTicket: isLostTicket,
                vehicleType: isLostTicket ? selectedLostVehicleType : null,
                isWorkerFree
            };

            // Add exit image if captured
            if (exitPhotoBase64) {
                paymentPayload.captureImageExit = exitPhotoBase64;
            }

            const response = await paymentService.process(paymentPayload);

            closeLoading();

            if (response.data.success) {
                const changeAmount = received - finalAmount;
                setPayment({
                    ...response.data.data.payment,
                    cashReceived: received,
                    changeGiven: changeAmount
                });
                setStep(3);
                showSuccess('Pembayaran berhasil!');
            } else {
                showError(response.data.message);
            }
        } catch (error) {
            closeLoading();
            const message = error.response?.data?.message || 'Gagal memproses pembayaran';
            showError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleNewSearch = () => {
        setSearchQuery('');
        setSearchMode('ticket');
        setTicket(null);
        setCalculation(null);
        setPayment(null);
        setCashReceived('');
        setChange(0);
        setShowExitCamera(false);
        setExitPhotoBase64(null);
        setIsLostTicket(false);
        setSelectedLostVehicleType(null);
        setLostTicketFeeAmount(0);
        setPaymentNotes('');
        setIsWorkerFree(false);
        setStep(1);
    };

    // Exit camera handlers
    const captureExitPhoto = () => {
        const imageSrc = exitWebcamRef.current?.getScreenshot({ width: 1280, height: 720, quality: 0.92 });
        if (imageSrc) {
            setExitPhotoBase64(imageSrc);
            setShowExitCamera(false);
            showSuccess('Foto exit tersimpan!');
        }
    };

    const retakeExitPhoto = () => {
        setExitPhotoBase64(null);
        setShowExitCamera(true);
    };

    // Handle lost ticket selection
    const handleSelectLostVehicleType = async (vehicleType) => {
        setSelectedLostVehicleType(vehicleType);
        const feeFromVehicle =
            vehicleType === 'car' ? lostTicketFees.car : lostTicketFees.motorcycle;
        const effectiveFee = feeFromVehicle || lostTicketFees.global || 200000;
        setLostTicketFeeAmount(effectiveFee);
    };

    const handlePrint = () => {
        window.print();
    };

    // Helper formatter
    const formatRupiah = (value) => {
        const number = parseInt(value.replace(/\D/g, ''), 10) || 0;
        return number === 0 ? '' : number.toLocaleString('id-ID');
    };

    const handleNominalChange = (e) => {
        const val = e.target.value.replace(/\D/g, '');
        setCashReceived(val);
    };

    // Quick cash buttons
    const addCash = (amount) => {
        const current = parseInt(cashReceived.replace(/\D/g, ''), 10) || 0;
        setCashReceived((current + amount).toString());
    };

    const exactAmount = () => {
        setCashReceived(calculation.amount.toString());
    };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">

            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8 pb-4 border-b border-slate-200">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <i className="fas fa-arrow-right-from-bracket text-white text-xl"></i>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Post Keluar</h1>
                        <p className="text-slate-500 text-sm">Validasi tiket & pembayaran</p>
                    </div>
                </div>

                {/* Step 1: Search */}
                {step === 1 && (
                    <div className="max-w-xl mx-auto animate-fade-in">
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                            
                            <h2 className="text-lg font-semibold text-slate-900 mb-6 text-center">Identifikasi Kendaraan Keluar</h2>
                            
                            {/* Barcode scanner button */}
                            <button
                                type="button"
                                onClick={() => setShowScanner(!showScanner)}
                                className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 font-semibold transition-all duration-300 mb-6 ${
                                    showScanner 
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20' 
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                                }`}
                            >
                                <i className={`fas ${showScanner ? 'fa-times' : 'fa-barcode'} text-xl`}></i>
                                {showScanner ? 'Tutup Kamera Scanner' : 'Pindai Barcode Tiket'}
                            </button>

                            {/* Scanner */}
                            {showScanner && (
                                <div className="mb-6 rounded-xl overflow-hidden border border-emerald-500/30 bg-black shadow-inner shadow-black relative" style={{ height: '320px' }}>
                                    <div id="barcode-scanner-exit" className="w-full h-full object-cover"></div>
                                    <div className="absolute inset-0 border-2 border-emerald-500/50 rounded-xl pointer-events-none"></div>
                                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3/4 h-32 border-2 border-dashed border-emerald-400/70 pointer-events-none"></div>
                                </div>
                            )}

                            <div className="flex items-center gap-4 my-6">
                                <div className="h-px bg-slate-200 flex-1"></div>
                                <span className="text-slate-500 text-sm font-medium uppercase tracking-wider">Atau Cari Manual</span>
                                <div className="h-px bg-slate-200 flex-1"></div>
                            </div>

                            {/* Search Mode Toggle */}
                            <div className="flex gap-3 mb-4">
                                <button
                                    type="button"
                                    onClick={() => { setSearchMode('ticket'); setIsLostTicket(false); }}
                                    className={`flex-1 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                                        searchMode === 'ticket' && !isLostTicket
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                                    }`}
                                >
                                    <i className="fas fa-ticket"></i> Nomor Tiket
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSearchMode('plate'); setIsLostTicket(false); }}
                                    className={`flex-1 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                                        searchMode === 'plate' && !isLostTicket
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                                    }`}
                                >
                                    <i className="fas fa-car"></i> Plat Nomor
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsLostTicket(true); setSearchMode(null); }}
                                    className={`flex-1 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                                        isLostTicket
                                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50'
                                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                                    }`}
                                >
                                    <i className="fas fa-exclamation-circle"></i> Tiket Hilang
                                </button>
                            </div>

                            {/* Lost Ticket Flow */}
                            {isLostTicket ? (
                                <div className="space-y-4">
                                    <label className="block text-sm font-medium text-slate-600 mb-2">Pilih Tipe Kendaraan</label>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleSelectLostVehicleType('car')}
                                            className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                                                selectedLostVehicleType === 'car'
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                            }`}
                                        >
                                            <i className="fas fa-car mr-2"></i>Mobil
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSelectLostVehicleType('motorcycle')}
                                            className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                                                selectedLostVehicleType === 'motorcycle'
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                            }`}
                                        >
                                            <i className="fas fa-motorcycle mr-2"></i>Motor
                                        </button>
                                    </div>
                                    {selectedLostVehicleType && (
                                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-4">
                                            <p className="text-slate-600 text-sm mb-2">Biaya Tiket Hilang:</p>
                                            <p className="text-2xl font-bold text-emerald-400">
                                                Rp {lostTicketFeeAmount.toLocaleString('id-ID')}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setTicket({ id: null, vehicleType: selectedLostVehicleType });
                                                    setCalculation({ amount: lostTicketFeeAmount, formattedAmount: `Rp ${lostTicketFeeAmount.toLocaleString('id-ID')}` });
                                                    setStep(2);
                                                }}
                                                className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-3 rounded-lg transition-all"
                                            >
                                                <i className="fas fa-check mr-2"></i>Lanjutkan ke Pembayaran
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Normal ticket/plate search form */
                            <form onSubmit={handleSearch} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-2">
                                        {searchMode === 'ticket' ? 'Nomor Tiket (T-XXXXX)' : 'Nomor Plat (Cth: B 1234 ABC)'}
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <i className={`fas ${searchMode === 'ticket' ? 'fa-ticket' : 'fa-car'} text-slate-400`}></i>
                                        </div>
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                                            className="w-full bg-white border border-slate-300 rounded-xl pl-12 pr-4 py-4 text-slate-900 text-xl font-mono tracking-wider focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                                            placeholder={searchMode === 'ticket' ? 'T-ABC12' : 'B 1234 ABC'}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <><i className="fas fa-spinner fa-spin"></i> Mencari...</>
                                    ) : (
                                        <><i className="fas fa-search"></i> Cari Tiket</>
                                    )}
                                </button>
                            </form>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 2: Validation & Payment Cashier */}
                {step === 2 && ticket && calculation && (
                    <div className={`grid gap-8 animate-fade-in ${isLostTicket ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-12'}`}>
                        
                        {/* Left Column: Validation Dashboard - Hidden for Lost Tickets */}
                        {!isLostTicket && (
                            <div className="lg:col-span-7 space-y-6">
                            
                            {/* Entry Captured Image */}
                            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                        <i className="fas fa-camera text-emerald-400"></i> Foto Saat Masuk
                                    </h3>
                                    <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md">
                                        {new Date(ticket.entryTime).toLocaleString('id-ID')}
                                    </span>
                                </div>
                                <div className="bg-black aspect-video flex items-center justify-center relative group">
                                    {ticket.entryImagePath ? (
                                        <img 
                                            src={`/${ticket.entryImagePath}`}
                                            alt="Captured Entry" 
                                            className="w-full h-full object-contain"
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.style.display = 'none';
                                                e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
                                            }}
                                        />
                                    ) : null}
                                    {!ticket.entryImagePath && (
                                        <div className="flex flex-col items-center text-slate-500">
                                            <i className="fas fa-image text-4xl mb-2"></i>
                                            <p>Tidak ada foto dari gerbang masuk</p>
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-white text-sm">Otorisasi Visual: Verifikasi plat nomor sesuai dengan gambar yang ditangkap.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Ticket Info Details */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Nomor Tiket</p>
                                    <p className="text-xl font-mono font-bold text-slate-900 tracking-widest">{ticket.ticketNumber}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Plat Nomor System</p>
                                    <p className="text-xl font-mono font-bold text-emerald-400 tracking-widest">{ticket.plateNumber}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Jenis Kendaraan</p>
                                    <p className="text-lg font-medium text-slate-900 capitalize flex items-center gap-2">
                                        <i className={`fas ${ticket.vehicleType === 'motorcycle' ? 'fa-motorcycle' : 'fa-car'} text-slate-500`}></i>
                                        {ticket.vehicleType}
                                    </p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Durasi</p>
                                    <p className="text-lg font-medium text-slate-900">{calculation.formattedDuration}</p>
                                </div>
                            </div>

                        </div>
                        )}

                        {/* Exit Photo Capture Section */}
                        <div className={isLostTicket ? '' : 'lg:col-span-5'}>
                        {!showExitCamera && !exitPhotoBase64 && (
                            <div className={`${isLostTicket ? 'max-w-md mx-auto' : ''} bg-white border border-slate-200 rounded-2xl p-4 text-center`}>
                                <p className="text-slate-600 text-sm mb-3">Abadikan kendaraan saat exit sebagai bukti?</p>
                                <button
                                    type="button"
                                    onClick={() => setShowExitCamera(true)}
                                    className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <i className="fas fa-camera"></i> Ambil Foto Exit
                                </button>
                            </div>
                        )}

                        {showExitCamera && (
                            <div className={`${isLostTicket ? 'max-w-md mx-auto' : ''} bg-black rounded-2xl overflow-hidden border border-slate-700`}>
                                <Webcam
                                    ref={exitWebcamRef}
                                    audio={false}
                                    screenshotFormat="image/jpeg"
                                    videoConstraints={{ width: 640, height: 360, facingMode: 'environment' }}
                                    className="w-full h-auto"
                                    style={{ aspectRatio: '16 / 9' }}
                                />
                                <div className="p-4 space-y-2 bg-slate-100">
                                    <button
                                        type="button"
                                        onClick={captureExitPhoto}
                                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2"
                                    >
                                        <i className="fas fa-camera"></i> Ambil Foto
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowExitCamera(false)}
                                        className="w-full bg-slate-300 hover:bg-slate-400 text-slate-800 font-medium py-3 rounded-lg"
                                    >
                                        Batal
                                    </button>
                                </div>
                            </div>
                        )}

                        {exitPhotoBase64 && (
                            <div className={`${isLostTicket ? 'max-w-md mx-auto' : ''} rounded-2xl overflow-hidden border border-emerald-500/30`}>
                                <img src={exitPhotoBase64} alt="Exit" className="w-full h-auto" style={{ aspectRatio: '16 / 9', objectFit: 'cover' }} />
                                <div className="p-4 space-y-2 bg-slate-100">
                                    <p className="text-emerald-400 text-sm text-center flex items-center justify-center gap-2">
                                        <i className="fas fa-check-circle"></i> Foto exit tersimpan
                                    </p>
                                    <button
                                        type="button"
                                        onClick={retakeExitPhoto}
                                        className="w-full bg-slate-300 hover:bg-slate-400 text-slate-700 font-medium py-2 rounded-lg text-sm"
                                    >
                                        Ambil Ulang
                                    </button>
                                </div>
                            </div>
                        )}
                        </div>

                        {/* Right Column: Cashier Terminal */}
                        <div className={isLostTicket ? '' : 'lg:col-span-5'}>
                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm sticky top-8">
                                
                                <div className="text-center mb-6 bg-slate-50 border border-emerald-200 rounded-xl p-4">
                                    <p className="text-slate-500 text-xs font-medium mb-2">TOTAL YANG HARUS DIBAYAR</p>
                                    <p className="text-3xl font-bold text-emerald-400 mb-2">Rp {calculation.amount?.toLocaleString('id-ID')}</p>
                                    {isWorkerFree && (
                                        <p className="text-xs text-blue-600 font-semibold mt-1">Mode Gratis Karyawan aktif (tagihan akan jadi Rp 0)</p>
                                    )}
                                    {!isLostTicket && (
                                        <p className="text-xs text-slate-500">Tarif: Rp {calculation.ratePerHour?.toLocaleString('id-ID')}/jam  •  Durasi: {calculation.formattedDuration}</p>
                                    )}
                                    {isLostTicket && (
                                        <p className="text-xs text-slate-500">Biaya Tiket Hilang ({selectedLostVehicleType === 'motorcycle' ? 'Motor' : 'Mobil'})</p>
                                    )}
                                </div>

                                <div className="space-y-5">

                                    {/* Payment Notes / Lost Ticket Reason */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            {isLostTicket ? 'Alasan Tiket Hilang (Opsional)' : 'Catatan Pembayaran (Opsional)'}
                                        </label>
                                        <textarea
                                            value={paymentNotes}
                                            onChange={(e) => setPaymentNotes(e.target.value)}
                                            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all resize-none"
                                            placeholder="Masukkan catatan..."
                                            rows="2"
                                        />
                                    </div>

                                    {!isLostTicket && (
                                        <label className="flex items-center gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900">
                                            <input
                                                type="checkbox"
                                                checked={isWorkerFree}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setIsWorkerFree(checked);
                                                    if (checked) setCashReceived('0');
                                                }}
                                                className="w-4 h-4 accent-blue-600"
                                            />
                                            <span className="text-sm font-medium">Gratis Karyawan (bebas biaya parkir)</span>
                                        </label>
                                    )}
                                    
                                    {/* Cash Input */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Nominal Uang Diterima (Rp)
                                        </label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <span className="text-slate-500 font-bold">Rp</span>
                                            </div>
                                            <input
                                                ref={amountInputRef}
                                                type="text"
                                                value={formatRupiah(cashReceived)}
                                                onChange={handleNominalChange}
                                                disabled={isWorkerFree}
                                                className="w-full bg-white border-2 border-emerald-300 rounded-xl pl-12 pr-4 py-4 text-slate-900 text-2xl font-bold focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    {/* Quick Cash Buttons */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <button type="button" disabled={isWorkerFree} onClick={() => setCashReceived((calculation.amount).toString())} className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm py-2 rounded-lg transition-colors border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                            Uang Pas
                                        </button>
                                        <button type="button" disabled={isWorkerFree} onClick={() => addCash(10000)} className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm py-2 rounded-lg transition-colors border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                            +10rb
                                        </button>
                                        <button type="button" disabled={isWorkerFree} onClick={() => addCash(50000)} className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm py-2 rounded-lg transition-colors border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                            +50rb
                                        </button>
                                        <button type="button" disabled={isWorkerFree} onClick={() => addCash(20000)} className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm py-2 rounded-lg transition-colors border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                            +20rb
                                        </button>
                                        <button type="button" disabled={isWorkerFree} onClick={() => addCash(100000)} className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm py-2 rounded-lg transition-colors border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                            +100rb
                                        </button>
                                        <button type="button" onClick={() => setCashReceived(isWorkerFree ? '0' : '')} className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm py-2 rounded-lg transition-colors border border-rose-500/30">
                                            Reset
                                        </button>
                                    </div>

                                    {/* Change / Kembalian */}
                                    <div className={`p-4 rounded-xl border ${change > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-600 font-medium">Kembalian</span>
                                            <span className={`text-2xl font-bold ${change > 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                                                Rp {change.toLocaleString('id-ID')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Warning: Photo Required */}
                                    {!exitPhotoBase64 && (
                                        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-center text-red-300 text-xs font-medium flex items-center justify-center gap-2">
                                            <i className="fas fa-exclamation-triangle"></i>
                                            Foto exit wajib diambil sebelum menyelesaikan transaksi
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex flex-col gap-3 pt-4">
                                        <button
                                            onClick={handlePayment}
                                            disabled={loading || !exitPhotoBase64 || (!isWorkerFree && (parseInt(cashReceived.replace(/\D/g, ''), 10) || 0) < (calculation.amount || 0))}
                                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-lg py-4 rounded-xl shadow-lg shadow-emerald-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {loading ? (
                                                <><i className="fas fa-spinner fa-spin"></i> Memproses...</>
                                            ) : (
                                                <><i className="fas fa-check-circle"></i> Selesaikan Transaksi</>
                                            )}
                                        </button>

                                        <button
                                            onClick={handleNewSearch}
                                            className="w-full bg-transparent hover:bg-slate-100 text-slate-600 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                                        >
                                            <i className="fas fa-arrow-left"></i> Kembali / Batal
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Receipt */}
                {step === 3 && payment && (
                    <div className="max-w-md mx-auto animate-fade-in">
                        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center relative overflow-hidden">
                            
                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <i className="fas fa-check text-4xl text-emerald-400"></i>
                            </div>
                            
                            <h2 className="text-2xl font-bold text-slate-900 mb-2">Pembayaran Sukses</h2>
                            <p className="text-slate-500 font-mono mb-8">{ticket.ticketNumber}</p>

                            <div className="space-y-4 mb-8 text-left bg-slate-50 p-6 rounded-xl border border-slate-200">
                                <div className="flex justify-between border-b border-slate-200 pb-2">
                                    <span className="text-slate-500">Total Tagihan</span>
                                    <span className="text-slate-900 font-bold">{calculation.formattedAmount}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-200 pb-2">
                                    <span className="text-slate-500">Total Bayar</span>
                                    <span className="text-emerald-400 font-bold">
                                        Rp {(payment?.isWorkerFree ? 0 : (calculation.amount || 0)).toLocaleString('id-ID')}
                                    </span>
                                </div>
                                <div className="flex justify-between border-b border-slate-200 pb-2">
                                    <span className="text-slate-500">Tunai Diterima</span>
                                    <span className="text-slate-900">Rp {payment.cashReceived?.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between pb-2">
                                    <span className="text-slate-500">Kembali</span>
                                    <span className="text-emerald-400 font-bold">Rp {payment.changeGiven?.toLocaleString('id-ID')}</span>
                                </div>
                                {paymentNotes && (
                                    <div className="border-t border-slate-200 pt-2 mt-2">
                                        <p className="text-slate-500 text-xs mb-1">Catatan:</p>
                                        <p className="text-slate-700 text-sm">{paymentNotes}</p>
                                    </div>
                                )}
                                {payment?.isWorkerFree && (
                                    <div className="border-t border-slate-200 pt-2 mt-2">
                                        <p className="text-blue-700 text-xs font-semibold">
                                            Transaksi diproses sebagai Gratis Karyawan
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleNewSearch}
                                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2"
                                >
                                    Selesai & Lanjut Tiket Berikutnya <i className="fas fa-arrow-right"></i>
                                </button>
                            </div>
                            
                            {/* Receipt perforations decoration */}
                            <div className="absolute top-0 left-0 right-0 h-4 bg-slate-900 border-b border-slate-700" style={{ backgroundImage: 'radial-gradient(circle at 10px 0, transparent 10px, #1e293b 11px)', backgroundSize: '20px 20px', backgroundPosition: '-10px 10px' }}></div>
                        </div>
                    </div>
                )}

                {/* Back Link */}
                {step === 1 && (
                    <div className="text-center mt-12 no-print">
                        <Link to="/" className="text-slate-500 hover:text-slate-700 transition-colors inline-flex items-center gap-2 font-medium">
                            <i className="fas fa-arrow-left"></i>
                            Kembali ke Beranda Utama
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Exit;