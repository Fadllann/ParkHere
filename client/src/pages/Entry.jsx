import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import { printTicketViaIframe } from '../components/common/TicketPrint';
import { ticketService } from '../services/api';
import { showSuccess, showError, showLoading, closeLoading } from '../utils/alerts';

const Entry = () => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({ plateNumber: '', vehicleType: 'car' });
    const [ticket, setTicket] = useState(null);
    const [parkingInfo, setParkingInfo] = useState({ name: 'ParkHere', address: '' });
    const [loading, setLoading] = useState(false);

    const vehicleTypes = [
        { value: 'motorcycle', label: 'Sepeda Motor', icon: 'fa-motorcycle' },
        { value: 'car',        label: 'Mobil',        icon: 'fa-car' },
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.plateNumber.trim()) {
            showError('Plat nomor harus diisi');
            return;
        }

        setLoading(true);
        showLoading('Membuat tiket...');

        try {
            const response = await ticketService.create({
                plateNumber: formData.plateNumber.toUpperCase(),
                vehicleType: formData.vehicleType
            });

            closeLoading();

            if (response.data.success) {
                setTicket(response.data.data.ticket);
                setParkingInfo({
                    name: response.data.data.parkingName || 'ParkHere',
                    address: response.data.data.parkingAddress || ''
                });
                setStep(3);
                showSuccess('Tiket berhasil dibuat!');
            } else {
                showError(response.data.message);
            }
        } catch (error) {
            closeLoading();
            const message = error.response?.data?.message || 'Gagal membuat tiket';
            showError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleNewTicket = () => {
        setFormData({ plateNumber: '', vehicleType: 'car' });
        setTicket(null);
        setStep(1);
    };

    const handlePrint = () => {
        if (!ticket) return;
        printTicketViaIframe(ticket, parkingInfo);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-[#e8eef7] to-slate-200/90">
            <Navbar />

            <div className="max-w-4xl mx-auto px-4 py-12">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-900 to-[#1e3a5f] shadow-lg shadow-slate-900/25 ring-2 ring-amber-400/30 mb-4">
                        <i className="fas fa-arrow-right-to-bracket text-white text-2xl"></i>
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 font-display tracking-tight">Masuk Parkir</h1>
                    <p className="text-gray-600 mt-2">Buat tiket parkir baru untuk kendaraan Anda</p>
                </div>

                {/* Step 1: Form */}
                {step === 1 && (
                    <div className="ph-card rounded-3xl p-8 max-w-lg mx-auto animate-fade-in">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Plat Nomor Kendaraan
                                </label>
                                <input
                                    type="text"
                                    value={formData.plateNumber}
                                    onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value.toUpperCase() })}
                                    className="input-field text-center text-2xl font-bold tracking-widest"
                                    placeholder="B 1234 XYZ"
                                    maxLength={15}
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    Jenis Kendaraan
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    {vehicleTypes.map((type) => (
                                        <button
                                            key={type.value}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, vehicleType: type.value })}
                                            className={`p-4 rounded-xl border-2 transition-all ${
                                                formData.vehicleType === type.value
                                                    ? 'border-[#1e3a5f] bg-slate-50 text-slate-900 ring-1 ring-amber-400/25'
                                                    : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <i className={`fas ${type.icon} text-2xl mb-2`}></i>
                                            <p className="text-sm font-medium">{type.label}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button type="submit" disabled={loading} className="btn-primary w-full py-4 text-lg">
                                {loading
                                    ? <><i className="fas fa-spinner fa-spin mr-2"></i>Memproses...</>
                                    : <><i className="fas fa-ticket mr-2"></i>Buat Tiket</>}
                            </button>
                        </form>
                    </div>
                )}

                {/* Step 3: Ticket Result */}
                {step === 3 && ticket && (
                    <div className="max-w-md mx-auto animate-fade-in">
                        <div className="ph-card rounded-3xl overflow-hidden print-area">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-slate-900 via-[#1e3a5f] to-slate-800 p-6 text-white text-center border-b border-white/10">
                                <div className="flex items-center justify-center gap-2 mb-1">
                                    <i className="fas fa-parking text-amber-300"></i>
                                    <span className="font-semibold">{parkingInfo.name}</span>
                                </div>
                                {parkingInfo.address && (
                                    <p className="text-sky-200/90 text-xs mb-2">{parkingInfo.address}</p>
                                )}
                                <h2 className="text-2xl font-bold">TIKET PARKIR</h2>
                            </div>

                            {/* Info */}
                            <div className="p-8 bg-white">
                                <div className="text-center mb-6">
                                    <p className="text-3xl font-bold text-slate-900 tracking-wider font-mono">{ticket.ticketNumber}</p>
                                    <p className="text-gray-500 text-xs mt-1">Tunjukkan saat keluar</p>
                                </div>

                                <div className="space-y-4 text-left">
                                    {[
                                        ['Plat Nomor', ticket.plateNumber],
                                        ['Jenis Kendaraan', { car: 'Mobil', motorcycle: 'Sepeda Motor'}[ticket.vehicleType] || ticket.vehicleType],
                                        ['Waktu Masuk', new Date(ticket.entryTime).toLocaleString('id-ID')],
                                    ].map(([label, value]) => (
                                        <div key={label} className="flex justify-between py-3 border-b border-dashed last:border-0">
                                            <span className="text-gray-500">{label}</span>
                                            <span className="font-bold text-gray-900">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-gray-50 p-4 text-center text-sm text-gray-500">
                                <p>Simpan tiket ini untuk keluar parkir</p>
                                <p className="font-medium text-gray-700 mt-1">Terima kasih!</p>
                            </div>
                        </div>

                        <div className="flex gap-4 mt-6 no-print">
                            <button onClick={handlePrint} className="btn-primary flex-1">
                                <i className="fas fa-print mr-2"></i>Cetak Tiket
                            </button>
                            <button onClick={handleNewTicket} className="btn-outline flex-1">
                                <i className="fas fa-plus mr-2"></i>Tiket Baru
                            </button>
                        </div>
                    </div>
                )}

                <div className="text-center mt-8 no-print">
                    <Link to="/" className="text-gray-600 hover:text-gray-900">
                        <i className="fas fa-arrow-left mr-2"></i>Kembali ke Beranda
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default Entry;