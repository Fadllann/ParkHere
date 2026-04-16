import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import Sidebar from '../components/common/Sidebar';
import Loading from '../components/common/Loading';
import { adminService, ticketService } from '../services/api';
import { showError, showSuccess } from '../utils/alerts';
import {
  fetchRegulations,
  DEFAULT_REGULATIONS,
  shouldFireAutoReport,
  markReportDelivered,
  formatDuration,
} from '../utils/regulations';
import {
  getCachedDashboard,
  getCachedRegulations,
  invalidateDashboardCache,
} from '../utils/dashboardCache';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const vehicleTypeMap = {
  car: 'Mobil',
  motorcycle: 'Sepeda Motor',
};
const EMERGENCY_DISMISS_KEY = 'entry_emergency_done_ids';

const readDismissedEmergencyIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(EMERGENCY_DISMISS_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

const writeDismissedEmergencyIds = (ids) => {
  localStorage.setItem(EMERGENCY_DISMISS_KEY, JSON.stringify(Array.from(ids)));
};

// Raw fetcher passed into the cache layer
async function fetchDashboardData() {
  const [dashRes, lostRes] = await Promise.all([
    adminService.getDashboard(),
    ticketService.search({ status: 'lost', limit: 100 }),
  ]);
  return {
    stats:       dashRes.data.success ? dashRes.data.data            : null,
    lostTickets: lostRes.data.success ? lostRes.data.data.tickets || [] : [],
  };
}

const AdminDashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [lostTickets, setLostTickets] = useState([]);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTriggeredAt, setReportTriggeredAt] = useState(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef(null);

  const [regulations, setRegulations] = useState(DEFAULT_REGULATIONS);
  const regulationsRef = useRef(DEFAULT_REGULATIONS);
  const [dismissedEmergencyIds, setDismissedEmergencyIds] = useState(() => readDismissedEmergencyIds());

  // Dashboard fetch goes through the cache layer
  // if the data is < 30 seconds old. After 30s it silently refreshes.
  const loadDashboard = useCallback(async (silent = false, force = false) => {
    try {
      const { stats: newStats, lostTickets: newLost } =
        await getCachedDashboard(fetchDashboardData, force);

      if (newStats      !== null) setStats(newStats);
      if (newLost       !== null) setLostTickets(newLost);
    } catch {
      if (!silent) showError('Gagal memuat dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  // Regulations — cached for 5 minutes
  useEffect(() => {
    getCachedRegulations(fetchRegulations).then(({ regs }) => {
      setRegulations(regs);
      regulationsRef.current = regs;
      if (shouldFireAutoReport(regs)) {
        markReportDelivered();
        setReportTriggeredAt(new Date());
        setShowReportModal(true);
      }
    });
  }, []);

  // Mount: fetch data on page load
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Light polling so emergencies show without manual refresh
  useEffect(() => {
    const t = setInterval(() => {
      loadDashboard(true, false);
    }, 25000);
    return () => clearInterval(t);
  }, [loadDashboard]);

  // Close notif dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target))
        setShowNotifDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Delete all lost
  const handleDeleteAllLost = async () => {
    if (lostTickets.length === 0) return;
    setDeletingAll(true);
    try {
      const results = await Promise.allSettled(
        lostTickets.map((t) => ticketService.delete(t.id))
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed    = results.length - succeeded;
      if (succeeded > 0)
        showSuccess(`${succeeded} tiket hilang berhasil dihapus${failed > 0 ? `, ${failed} gagal` : ''}`);
      else
        showError('Semua penghapusan gagal');

      setShowDeleteAllModal(false);
      setShowReportModal(false);
      // Invalidate cache so the next load hits the API for fresh data
      invalidateDashboardCache();
      await loadDashboard(true, true);
    } catch {
      showError('Gagal menghapus tiket');
    } finally {
      setDeletingAll(false);
    }
  };

  // Chart
  const vehicleChartData = {
    labels: stats?.vehicleDistribution?.map((v) => vehicleTypeMap[v.vehicleType] || v.vehicleType) || [],
    datasets: [{
      data: stats?.vehicleDistribution?.map((v) => v.count) || [],
      backgroundColor: ['#38bdf8', '#f59e0b', '#10b981', '#64748b'],
      borderWidth: 0,
    }],
  };

  if (loading) return <Loading fullScreen text="Memuat dashboard..." />;

  const entryEmergencies = (stats?.entryEmergencies || []).filter((ev) => !dismissedEmergencyIds.has(ev.id));
  const notifCount = lostTickets.length + entryEmergencies.length;

  const markEmergenciesDone = () => {
    if (entryEmergencies.length === 0) return;
    const next = new Set(dismissedEmergencyIds);
    entryEmergencies.forEach((ev) => next.add(ev.id));
    setDismissedEmergencyIds(next);
    writeDismissedEmergencyIds(next);
    showSuccess(`${entryEmergencies.length} notifikasi darurat ditandai selesai`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-[#e8eef7] to-slate-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:ml-[260px]">
        {/* Header */}
        <header className="bg-white/95 backdrop-blur-sm border-b border-slate-200/80 sticky top-0 z-10 shadow-sm shadow-slate-900/5">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100">
                <i className="fas fa-bars text-gray-600 text-sm"></i>
              </button>
              <h1 className="text-lg font-bold text-slate-900 font-display tracking-tight">Dashboard</h1>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 hidden sm:block">
                {new Date().toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
              </span>

              {/* Notification bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setShowNotifDropdown((v) => !v)}
                  className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Notifikasi"
                >
                  <i className="fas fa-bell text-gray-600 text-sm"></i>
                  {notifCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-0.5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold leading-none">
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </button>

                {showNotifDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-20 overflow-hidden max-h-[min(70vh,520px)] flex flex-col">
                    {entryEmergencies.length > 0 && (
                      <>
                        <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 flex items-center justify-between shrink-0">
                          <span className="font-semibold text-sm text-rose-900">
                            <i className="fas fa-bell text-rose-600 mr-1.5"></i>Gerbang Masuk
                          </span>
                          <span className="text-xs text-rose-700">{entryEmergencies.length} darurat</span>
                        </div>
                        <div className="max-h-40 overflow-y-auto border-b border-gray-100">
                          {entryEmergencies.slice(0, 6).map((ev) => (
                            <div key={ev.id} className="px-4 py-2.5 border-b border-gray-50 text-xs">
                              <p className="font-medium text-rose-800">Bantuan diminta di gerbang masuk</p>
                              <p className="text-gray-500 mt-0.5">
                                {ev.createdAt ? new Date(ev.createdAt).toLocaleString('id-ID') : ''}
                              </p>
                            </div>
                          ))}
                        </div>
                        <Link
                          to="/auto-entry"
                          onClick={() => setShowNotifDropdown(false)}
                          className="block mx-4 my-3 text-center text-xs py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors shrink-0"
                        >
                          Buka Gerbang Masuk
                        </Link>
                        <button
                          onClick={() => { markEmergenciesDone(); setShowNotifDropdown(false); }}
                          className="block mx-4 mb-3 text-center text-xs py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors shrink-0"
                        >
                          Mark as Done
                        </button>
                      </>
                    )}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
                      <span className="font-semibold text-sm text-gray-900">
                        <i className="fas fa-exclamation-circle text-red-500 mr-1.5"></i>Tiket Hilang
                      </span>
                      <span className="text-xs text-gray-500">{lostTickets.length} tiket</span>
                    </div>
                    {lostTickets.length === 0 ? (
                      <div className="px-4 py-6 text-center text-gray-400 text-xs">
                        <i className="fas fa-check-circle text-2xl mb-2 block text-green-400"></i>
                        Tidak ada tiket hilang
                      </div>
                    ) : (
                      <>
                        <div className="max-h-64 overflow-y-auto">
                          {lostTickets.slice(0, 8).map((ticket) => (
                            <div key={ticket.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50">
                              <div>
                                <p className="font-semibold text-xs text-gray-900">{ticket.plateNumber}</p>
                                <p className="text-xs text-gray-400 font-mono">{ticket.ticketNumber}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-red-500 font-medium">{formatDuration(ticket.entryTime)}</p>
                                <p className="text-xs text-gray-400">{vehicleTypeMap[ticket.vehicleType]}</p>
                              </div>
                            </div>
                          ))}
                          {lostTickets.length > 8 && (
                            <p className="text-center text-xs text-gray-400 py-2">+{lostTickets.length - 8} lainnya</p>
                          )}
                        </div>
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
                          <button
                            onClick={() => { setShowNotifDropdown(false); setShowReportModal(true); }}
                            className="flex-1 text-xs text-center py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >Lihat Laporan</button>
                          <button
                            onClick={() => { setShowNotifDropdown(false); setShowDeleteAllModal(true); }}
                            className="flex-1 text-xs text-center py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                          >Hapus Semua</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {entryEmergencies.length > 0 && (
          <div className="mx-5 mt-4 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-exclamation-circle text-rose-600 text-sm"></i>
              </div>
              <div>
                <p className="text-sm font-semibold text-rose-900">
                  Darurat / gangguan di Gerbang Masuk
                </p>
                <p className="text-xs text-rose-700">
                  {entryEmergencies.length} permintaan bantuan dari gerbang masuk. Segera ke lokasi masuk.
                </p>
              </div>
            </div>
            <Link
              to="/auto-entry"
              className="flex-shrink-0 text-xs font-medium px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
            >
              Buka Gerbang Masuk
            </Link>
            <button
              onClick={markEmergenciesDone}
              className="flex-shrink-0 text-xs font-medium px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
            >
              Mark as Done
            </button>
          </div>
        )}

        {/* Lost tickets banner */}
        {regulations.autoReport.enabled && lostTickets.length > 0 && !showReportModal && (
          <div className="mx-5 mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-exclamation-triangle text-amber-600 text-sm"></i>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {lostTickets.length} tiket hilang memerlukan perhatian
                </p>
                <p className="text-xs text-amber-600">
                  Laporan otomatis dijadwalkan pukul <strong>{regulations.autoReport.reportTime}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowReportModal(true)}
              className="flex-shrink-0 text-xs font-medium px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >Lihat Laporan</button>
          </div>
        )}

        <div className="p-5 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs">Motor terpakai</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.activeMotorcycles ?? 0}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <i className="fas fa-motorcycle text-amber-700"></i>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div className="bg-gradient-to-r from-amber-600 to-amber-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(stats?.motorcycleOccupancyPercent || 0, 100)}%` }}></div>
                </div>
                <span className="text-xs text-gray-500">{stats?.motorcycleOccupancyPercent ?? 0}%</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                dari {stats?.maxCapacityMotorcycle ?? 0} slot motor
                {stats?.availableSpotsMotorcycle != null && (
                  <span className="text-emerald-600"> · sisa {stats.availableSpotsMotorcycle}</span>
                )}
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs">Mobil terpakai</p>
                  <p className="text-2xl font-bold text-sky-700 mt-1">{stats?.activeCars ?? 0}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
                  <i className="fas fa-car text-sky-700"></i>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div className="bg-gradient-to-r from-[#1e3a5f] to-sky-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(stats?.carOccupancyPercent || 0, 100)}%` }}></div>
                </div>
                <span className="text-xs text-gray-500">{stats?.carOccupancyPercent ?? 0}%</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                dari {stats?.maxCapacityCar ?? 0} slot mobil
                {stats?.availableSpotsCar != null && (
                  <span className="text-emerald-600"> · sisa {stats.availableSpotsCar}</span>
                )}
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs">Pendapatan Hari Ini</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{stats?.today?.formattedRevenue || 'Rp. 0'}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <i className="fas fa-wallet text-amber-700"></i>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">{stats?.today?.payments || 0} transaksi</p>
            </div>

            <div
              className={`rounded-xl p-4 shadow-sm cursor-pointer transition-colors ${lostTickets.length > 0 ? 'bg-red-50 border border-red-100 hover:bg-red-100' : 'bg-white hover:bg-gray-50'}`}
              onClick={() => lostTickets.length > 0 && setShowReportModal(true)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xs ${lostTickets.length > 0 ? 'text-red-500' : 'text-gray-500'}`}>Tiket Hilang</p>
                  <p className={`text-2xl font-bold mt-1 ${lostTickets.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {lostTickets.length}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${lostTickets.length > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                  <i className={`fas fa-exclamation-circle ${lostTickets.length > 0 ? 'text-red-600' : 'text-gray-400'}`}></i>
                </div>
              </div>
              {lostTickets.length > 0 ? (
                <p className="text-xs text-red-500 mt-2 font-medium"><i className="fas fa-arrow-right mr-0.5"></i>Klik untuk lihat laporan</p>
              ) : (
                <p className="text-xs text-gray-400 mt-2">Tidak ada tiket hilang</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
              <h3 className="font-semibold text-gray-900 text-sm mb-3 font-display">Distribusi Kendaraan</h3>
              <div className="h-40">
                {stats?.vehicleDistribution?.length > 0 ? (
                  <Doughnut data={vehicleChartData} options={{ plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } }, maintainAspectRatio: false }} />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">Belum ada data</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
              <h3 className="font-semibold text-gray-900 text-sm mb-3 font-display">Aksi Cepat</h3>
              <div className="space-y-2">
                {[
                  { to: '/entry', icon: 'fa-plus', wrap: 'bg-sky-50 hover:bg-sky-100', iconBg: 'bg-sky-600', label: 'Buat Tiket Manual', sub: 'Tiket baru' },
                  { to: '/exit', icon: 'fa-sign-out-alt', wrap: 'bg-emerald-50 hover:bg-emerald-100', iconBg: 'bg-emerald-600', label: 'Exit', sub: 'Keluar dan bayar' },
                  { to: '/admin/tickets', icon: 'fa-list', wrap: 'bg-amber-50 hover:bg-amber-100', iconBg: 'bg-amber-500', label: 'Tiket', sub: 'Semua kendaraan' },
                  { to: '/auto-entry', icon: 'fa-car-side', wrap: 'bg-gray-50 hover:bg-gray-100', iconBg: 'bg-gray-600', label: 'Buat Tiket Otomatis', sub: 'Masuk otomatis' },
                ].map(({ to, icon, wrap, iconBg, label, sub }) => (
                  <Link key={to} to={to} className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-colors ${wrap}`}>
                    <div className={`w-8 h-8 rounded ${iconBg} flex items-center justify-center`}>
                      <i className={`fas ${icon} text-white text-xs`}></i>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-xs">{label}</p>
                      <p className="text-xs text-gray-500">{sub}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
              <h3 className="font-semibold text-gray-900 text-sm mb-3 font-display">Aktivitas Terbaru</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {stats?.recentActivity?.length > 0 ? (
                  stats.recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-start gap-2 pb-2 border-b border-gray-100 last:border-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                        activity.action.includes('PAYMENT') ? 'bg-amber-100 text-amber-700' :
                        activity.action.includes('TICKET') ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <i className={`fas ${activity.action.includes('PAYMENT') ? 'fa-money-bill' : activity.action.includes('TICKET') ? 'fa-ticket' : 'fa-circle'}`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-900 truncate">{activity.action}</p>
                        <p className="text-xs text-gray-500">
                          {activity.user} • {new Date(activity.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 text-center py-3 text-xs">Belum ada aktivitas</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowReportModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-5 text-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <i className="fas fa-clipboard-list text-lg"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Laporan Tiket Hilang</h3>
                    <p className="text-red-100 text-xs">
                      {reportTriggeredAt
                        ? `Dilaporkan otomatis pada ${reportTriggeredAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} • ${reportTriggeredAt.toLocaleDateString('id-ID')}`
                        : `Dibuka manual • ${new Date().toLocaleDateString('id-ID')}`}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowReportModal(false)} className="text-white/70 hover:text-white text-xl leading-none">
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  { label: 'Total Hilang', value: lostTickets.length, icon: 'fa-ticket' },
                  { label: 'Motor', value: lostTickets.filter((t) => t.vehicleType === 'motorcycle').length, icon: 'fa-motorcycle' },
                  { label: 'Mobil', value: lostTickets.filter((t) => t.vehicleType === 'car').length, icon: 'fa-car' },
                ].map((s) => (
                  <div key={s.label} className="bg-white/10 rounded-lg px-3 py-2 text-center">
                    <i className={`fas ${s.icon} text-white/70 text-xs mb-1 block`}></i>
                    <p className="font-bold text-lg leading-none">{s.value}</p>
                    <p className="text-red-100 text-xs mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {lostTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <i className="fas fa-check-circle text-4xl mb-3 text-green-400"></i>
                  <p className="font-medium">Tidak ada tiket hilang</p>
                  <p className="text-xs mt-1">Semua tiket dalam kondisi normal</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                      <tr>
                        {['No. Tiket', 'Plat', 'Jenis', 'Waktu Masuk', 'Durasi'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lostTickets.map((ticket) => (
                        <tr key={ticket.id} className="border-b border-gray-50 hover:bg-red-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">{ticket.ticketNumber}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">{ticket.plateNumber}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{vehicleTypeMap[ticket.vehicleType] || ticket.vehicleType}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {new Date(ticket.entryTime).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-semibold text-red-500">{formatDuration(ticket.entryTime)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              {lostTickets.length > 0 && (
                <button onClick={() => { setShowReportModal(false); setShowDeleteAllModal(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                  <i className="fas fa-trash-alt"></i>Hapus Semua ({lostTickets.length})
                </button>
              )}
              <Link to="/admin/tickets" onClick={() => setShowReportModal(false)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <i className="fas fa-external-link-alt"></i>Kelola Tiket
              </Link>
              <button onClick={() => setShowReportModal(false)}
                className="ml-auto flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={(e) => !deletingAll && e.target === e.currentTarget && setShowDeleteAllModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-red-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <i className="fas fa-trash-alt text-xl"></i>
                </div>
                <div>
                  <h3 className="font-bold text-lg">Hapus Semua Tiket Hilang</h3>
                  <p className="text-red-100 text-xs">Tindakan ini bersifat permanen</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-sm mb-4">
                Anda akan menghapus <strong className="text-red-600">{lostTickets.length} tiket hilang</strong> dari sistem. Data yang dihapus tidak dapat dipulihkan.
              </p>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total tiket dihapus</span>
                  <span className="font-bold text-red-700">{lostTickets.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tanggal operasi</span>
                  <span className="font-medium text-gray-700">{new Date().toLocaleDateString('id-ID')}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteAllModal(false)} disabled={deletingAll}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
                  Batal
                </button>
                <button onClick={handleDeleteAllLost} disabled={deletingAll}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors flex items-center justify-center gap-2">
                  {deletingAll ? <><i className="fas fa-spinner fa-spin"></i>Menghapus…</> : <><i className="fas fa-trash-alt"></i>Hapus Semuanya</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;