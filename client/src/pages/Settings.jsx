import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/common/Sidebar';
import Loading from '../components/common/Loading';
import ActivityLogsModal from '../components/admin/ActivityLogsModal';
import { adminService, ticketService, backupService } from '../services/api';
import { showError, showSuccess, showConfirm } from '../utils/alerts';
import {
  fetchRegulations,
  saveRegulations,
  clearReportTracker,
  DEFAULT_REGULATIONS,
  describeAutoMarkRule,
} from '../utils/regulations';
import {
  getCachedRegulations,
  getCachedSettings,
  getCachedDashboard,
  invalidateRegulationsCache,
  invalidateSettingsCache,
  invalidateDashboardCache,
} from '../utils/dashboardCache';
import { getCacheData, invalidateCache } from '../utils/apiCache';

const vehicleTypeMap = {
  car: 'Mobil',
  motorcycle: 'Sepeda Motor',
};

const roleMap = {
  admin: 'Admin',
  operator: 'Operator',
};

const getTodayStr = () => new Date().toISOString().split('T')[0];

async function fetchSettingsData() {
  const res = await adminService.getSettings();
  return res.data.data.settings;
}

async function fetchDashboardData() {
  const [dashRes, lostRes] = await Promise.all([
    adminService.getDashboard(),
    ticketService.search({ status: 'lost', limit: 100 }),
  ]);
  return {
    stats: dashRes.data.success ? dashRes.data.data : null,
    lostTickets: lostRes.data.success ? lostRes.data.data.tickets || [] : [],
  };
}

const ToggleSwitch = ({ checked, onChange, disabled = false, label, description }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex-1">
      {label && <p className="text-sm font-medium text-gray-900">{label}</p>}
      {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${checked ? 'bg-blue-600' : 'bg-gray-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'
          }`}
      />
    </button>
  </div>
);

const Settings = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);

  // General settings
  const [generalSettings, setGeneralSettings] = useState({
    parking_name: '',
    parking_address: '',
    max_capacity_car: 60,
    max_capacity_motorcycle: 40,
  });
  const [generalDirty, setGeneralDirty] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  /** Active counts per type (from dashboard) */
  const [activeByType, setActiveByType] = useState({ car: null, motorcycle: null });

  // Rates / Users
  const [rates, setRates] = useState([]);
  const [users, setUsers] = useState([]);
  const [globalLostFee, setGlobalLostFee] = useState(50000);
  const [savingGlobalFee, setSavingGlobalFee] = useState(false);
  const [rateToggles, setRateToggles] = useState({});
  const [savingRate, setSavingRate] = useState({});
  // Both rate cards expand/collapse in sync via a single boolean
  const [rateCardsExpanded, setRateCardsExpanded] = useState(false);
  const [rateCardDirty, setRateCardDirty] = useState({});
  const [rateCardOriginalValues, setRateCardOriginalValues] = useState({});
  const [rateEditValues, setRateEditValues] = useState({});
  const [showActivityLogs, setShowActivityLogs] = useState(false);

  useEffect(() => {
    if (activeTab !== 'general') setShowActivityLogs(false);
  }, [activeTab]);

  // Regulations
  const [regulations, setRegulations] = useState(DEFAULT_REGULATIONS);
  const [regulationDirty, setRegulationDirty] = useState(false);
  const [savingRegulations, setSavingRegulations] = useState(false);
  const [regulationsLoading, setRegulationsLoading] = useState(false);

  // Database
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [autoBackupConfig, setAutoBackupConfig] = useState({ isEnabled: false, interval: 'daily' });
  const [savingAutoBackup, setSavingAutoBackup] = useState(false);
  const [importFile, setImportFile] = useState(null);

  const loadGeneral = useCallback(async () => {
    setLoading(true);
    try {
      const [{ settings }, { stats }] = await Promise.all([
        getCachedSettings(fetchSettingsData),
        getCachedDashboard(fetchDashboardData),
      ]);
      const legacy = parseInt(settings.max_capacity, 10) || 100;
      const half = Math.max(1, Math.floor(legacy / 2));
      setGeneralSettings({
        parking_name: settings.parking_name || '',
        parking_address: settings.parking_address || '',
        max_capacity_car: settings.max_capacity_car != null && settings.max_capacity_car !== ''
          ? parseInt(settings.max_capacity_car, 10) || half
          : half,
        max_capacity_motorcycle:
          settings.max_capacity_motorcycle != null && settings.max_capacity_motorcycle !== ''
            ? parseInt(settings.max_capacity_motorcycle, 10) || Math.max(1, legacy - half)
            : Math.max(1, legacy - half),
      });
      setActiveByType({
        car: stats?.activeCars ?? null,
        motorcycle: stats?.activeMotorcycles ?? null,
      });
    } catch {
      showError('Gagal memuat pengaturan umum');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTabData = useCallback(async (tab) => {
    if (tab === 'general') { loadGeneral(); return; }

    if (tab === 'regulations') {
      setRegulationsLoading(true);
      try {
        const { regs } = await getCachedRegulations(fetchRegulations);
        setRegulations(regs);
        setRegulationDirty(false);
      } catch {
        showError('Gagal memuat regulasi');
      } finally {
        setRegulationsLoading(false);
      }
      return;
    }

    if (tab === 'database') {
      setLoading(true);
      try {
        const { data } = await getCacheData('backupStatus', async () => {
          const res = await backupService.getBackupStatus();
          return res.data.data.status;
        });
        setBackupStatus(data);
      } catch {
        showError('Gagal memuat status database');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      if (tab === 'rates') {
        const { data: ratesData } = await getCacheData('rates', async () => {
          const res = await adminService.getRates();
          return res.data.data.rates || [];
        });

        const toggles = {};
        const originalValues = {};
        const editValues = {};
        (ratesData || []).forEach(rate => {
          toggles[rate.vehicleType] = {
            lostTicketFeeEnabled: rate.lostTicketFee > 0,
            dailyMaxEnabled: rate.dailyMax > 0
          };
          originalValues[rate.vehicleType] = {
            ratePerHour: rate.ratePerHour,
            dailyMax: rate.dailyMax,
            gracePeriodMinutes: rate.gracePeriodMinutes,
            lostTicketFee: rate.lostTicketFee,
            lostTicketFeeEnabled: rate.lostTicketFee > 0,
            dailyMaxEnabled: rate.dailyMax > 0
          };
          editValues[rate.vehicleType] = {
            ratePerHour: rate.ratePerHour,
            dailyMax: rate.dailyMax,
            gracePeriodMinutes: rate.gracePeriodMinutes,
            lostTicketFee: rate.lostTicketFee
          };
        });
        setRateToggles(toggles);
        setRateCardOriginalValues(originalValues);
        setRateEditValues(editValues);
        setRateCardDirty({});
        setRateCardsExpanded(false);
        setRates(ratesData || []);
      } else if (tab === 'users') {
        const { data: usersData } = await getCacheData('users', async () => {
          const res = await adminService.getUsers();
          return res.data.data.users || [];
        });
        setUsers(usersData || []);
      }
    } catch {
      showError('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [loadGeneral]);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const updateGeneral = (key, value) => {
    setGeneralSettings((prev) => ({ ...prev, [key]: value }));
    setGeneralDirty(true);
  };

  const handleSaveGeneral = async () => {
    setSavingGeneral(true);
    try {
      const capCar = Math.max(1, parseInt(generalSettings.max_capacity_car, 10) || 1);
      const capMoto = Math.max(1, parseInt(generalSettings.max_capacity_motorcycle, 10) || 1);
      await adminService.updateSettings({
        parking_name: generalSettings.parking_name,
        parking_address: generalSettings.parking_address,
        max_capacity_car: capCar,
        max_capacity_motorcycle: capMoto,
        max_capacity: capCar + capMoto,
      });
      invalidateSettingsCache();
      invalidateCache('settings');
      showSuccess('Pengaturan umum berhasil disimpan');
      setGeneralDirty(false);
    } catch {
      showError('Gagal menyimpan pengaturan umum');
    } finally {
      setSavingGeneral(false);
    }
  };

  const updateRegulation = (section, key, value) => {
    setRegulations((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
    setRegulationDirty(true);
  };

  const handleSaveRegulations = async () => {
    setSavingRegulations(true);
    try {
      const ok = await saveRegulations(regulations);
      if (ok) {
        invalidateRegulationsCache();
        showSuccess('Pengaturan regulasi berhasil disimpan');
        setRegulationDirty(false);
      } else {
        showError('Gagal menyimpan pengaturan');
      }
    } catch {
      showError('Gagal menyimpan pengaturan');
    } finally {
      setSavingRegulations(false);
    }
  };

  const handleResetRegulations = async () => {
    const result = await showConfirm(
      'Reset semua pengaturan regulasi ke nilai default?',
      'Reset Regulasi', 'Ya, Reset', 'Batal'
    );
    if (!result.isConfirmed) return;
    await saveRegulations({ ...DEFAULT_REGULATIONS });
    invalidateRegulationsCache();
    setRegulations({ ...DEFAULT_REGULATIONS });
    clearReportTracker();
    showSuccess('Regulasi direset ke default');
    setRegulationDirty(false);
  };

  const handleClearReportTracker = async () => {
    const result = await showConfirm(
      'Reset tracker laporan? Laporan otomatis akan dikirim ulang hari ini jika waktunya sudah lewat.',
      'Reset Tracker', 'Ya, Reset', 'Batal'
    );
    if (!result.isConfirmed) return;
    clearReportTracker();
    showSuccess('Tracker laporan berhasil direset');
  };

  const handleSaveRate = async (rate) => {
    try {
      setSavingRate(prev => ({ ...prev, [rate.vehicleType]: true }));

      const toggleState = rateToggles[rate.vehicleType] || {};
      const editedRate = rateEditValues[rate.vehicleType] || rate;
      const updateData = {
        ratePerHour: editedRate.ratePerHour,
        gracePeriodMinutes: editedRate.gracePeriodMinutes,
        dailyMax: toggleState.dailyMaxEnabled ? editedRate.dailyMax : 0,
        lostTicketFee: toggleState.lostTicketFeeEnabled ? editedRate.lostTicketFee : 0,
      };

      await adminService.updateRate(rate.vehicleType, updateData);
      showSuccess('Tarif berhasil diperbarui');

      invalidateCache('rates');

      setRateCardOriginalValues(prev => ({
        ...prev,
        [rate.vehicleType]: { ...updateData, ...toggleState }
      }));
      setRateCardDirty(prev => ({ ...prev, [rate.vehicleType]: false }));
      loadTabData('rates');
    } catch {
      showError('Gagal memperbarui tarif');
    } finally {
      setSavingRate(prev => ({ ...prev, [rate.vehicleType]: false }));
    }
  };

  const handleSaveGlobalLostFee = async () => {
    try {
      setSavingGlobalFee(true);
      await adminService.updateSettings({ globalLostTicketFee: parseInt(globalLostFee) });
      showSuccess('Biaya tiket hilang global berhasil diperbarui');
      invalidateCache('rates', 'settings');
    } catch {
      showError('Gagal menyimpan biaya tiket hilang global');
    } finally {
      setSavingGlobalFee(false);
    }
  };

  const handleToggleRateOption = (vehicleType, option) => {
    setRateToggles(prev => ({
      ...prev,
      [vehicleType]: {
        ...prev[vehicleType],
        [option]: !prev[vehicleType]?.[option]
      }
    }));
    setRateCardDirty(prev => ({ ...prev, [vehicleType]: true }));
  };

  const isGlobalFeeLocked = () => {
    const original = rateCardOriginalValues;
    return rates.some(rate => original[rate.vehicleType]?.lostTicketFeeEnabled === true);
  };

  const handleToggleUser = async (user) => {
    const result = await showConfirm(
      `${user.isActive ? 'Nonaktifkan' : 'Aktifkan'} pengguna ${user.username}?`,
      'Konfirmasi'
    );
    if (!result.isConfirmed) return;
    try {
      await adminService.updateUser(user.id, { isActive: !user.isActive });
      showSuccess('Pengguna berhasil diperbarui');
      invalidateCache('users');
      loadTabData('users');
    } catch {
      showError('Gagal memperbarui pengguna');
    }
  };

  const handleCancelRegulations = useCallback(async () => {
    invalidateRegulationsCache();
    setRegulationsLoading(true);
    try {
      const { regs } = await getCachedRegulations(fetchRegulations);
      setRegulations(regs);
      setRegulationDirty(false);
    } catch {
      showError('Gagal memuat regulasi');
    } finally {
      setRegulationsLoading(false);
    }
  }, []);

  const handleManualBackup = async () => {
    try {
      setBackupLoading(true);
      const res = await backupService.triggerBackup();

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;

      const contentDisposition = res.headers['content-disposition'];
      let fileName = 'backup.zip';
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
        if (fileNameMatch && fileNameMatch.length === 2) fileName = fileNameMatch[1];
      }

      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();

      showSuccess('Backup berhasil diunduh');
      loadTabData('database');
    } catch {
      showError('Gagal membuat backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return showError('Pilih file backup terlebih dahulu');

    if (importFile.size > 50 * 1024 * 1024) {
      return showError('Ukuran file maksimal 50MB');
    }

    const result = await showConfirm(
      'Apakah Anda yakin ingin memulihkan database dari file ini? Ini akan menimpa seluruh data sistem saat ini dan tidak dapat dibatalkan.',
      'Konfirmasi Restore', 'Ya, Restore', 'Batal', 'warning'
    );

    if (!result.isConfirmed) return;

    try {
      setImportLoading(true);
      const formData = new FormData();
      formData.append('backupFile', importFile);

      await backupService.importDatabase(formData);
      showSuccess('Database berhasil dipulihkan');
      setImportFile(null);

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      showError(error.response?.data?.message || 'Gagal memulihkan database');
    } finally {
      setImportLoading(false);
    }
  };

  const handleSaveAutoBackup = async () => {
    try {
      setSavingAutoBackup(true);
      await backupService.configureAutoBackup(autoBackupConfig);
      showSuccess('Pengaturan backup otomatis berhasil disimpan');
      invalidateCache('backupStatus');
      loadTabData('database');
    } catch {
      showError('Gagal menyimpan pengaturan backup otomatis');
    } finally {
      setSavingAutoBackup(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'Umum', icon: 'fa-cog', badge: generalDirty },
    { id: 'rates', label: 'Tarif', icon: 'fa-money-bill' },
    { id: 'users', label: 'Pengguna', icon: 'fa-users' },
    { id: 'regulations', label: 'Regulasi', icon: 'fa-shield-alt', badge: regulationDirty },
    { id: 'database', label: 'Kelola Database', icon: 'fa-database' },
  ];

  const scheduledPreview = (() => {
    const { scheduledDate, scheduledTime } = regulations.autoMarkLost;
    if (!scheduledDate || !scheduledTime) return null;
    const dt = new Date(`${scheduledDate}T${scheduledTime}:00`);
    if (isNaN(dt)) return null;
    return { dt, isPast: dt < new Date() };
  })();

  const capCarNum = Math.max(1, parseInt(generalSettings.max_capacity_car, 10) || 1);
  const capMotoNum = Math.max(1, parseInt(generalSettings.max_capacity_motorcycle, 10) || 1);
  const motoPct =
    activeByType.motorcycle !== null
      ? Math.min(Math.round((activeByType.motorcycle / capMotoNum) * 100), 100)
      : null;
  const carPct =
    activeByType.car !== null
      ? Math.min(Math.round((activeByType.car / capCarNum) * 100), 100)
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-[#e8eef7] to-slate-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:ml-[260px]">
        <header className="bg-white/95 backdrop-blur-sm border-b border-slate-200/80 sticky top-0 z-10 shadow-sm shadow-slate-900/5">
          <div className="flex items-center px-5 py-3 gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100"
            >
              <i className="fas fa-bars text-gray-600 text-sm"></i>
            </button>
            <h1 className="text-lg font-bold text-slate-900 font-display tracking-tight">Pengaturan</h1>
          </div>
        </header>

        <div className="p-5">
          {/* Tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 mb-5">
            <div className="flex border-b overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  <i className={`fas ${tab.icon}`}></i>
                  {tab.label}
                  {tab.badge && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── General Tab ── */}
          {activeTab === 'general' && (
            loading ? <Loading text="Memuat..." /> : (
              <div className="space-y-5">
                {generalDirty && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-amber-700 text-sm">
                      <i className="fas fa-circle text-amber-400 text-xs"></i>
                      Ada perubahan yang belum disimpan
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { loadGeneral(); setGeneralDirty(false); }}
                        className="text-xs text-amber-700 hover:text-amber-800 font-medium"
                      >
                        Batalkan
                      </button>
                      <button
                        onClick={handleSaveGeneral}
                        disabled={savingGeneral}
                        className="text-xs px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                      >
                        Simpan Sekarang
                      </button>
                    </div>
                  </div>
                )}

                {/* Parking identity */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                      <i className="fas fa-building text-blue-500"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Identitas Parkir</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Ditampilkan pada tiket yang dicetak</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama Parkir</label>
                      <input
                        type="text"
                        value={generalSettings.parking_name}
                        onChange={(e) => updateGeneral('parking_name', e.target.value)}
                        placeholder="Nama Area Parkir"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-400 mt-1">Muncul sebagai judul di bagian atas tiket cetak</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Alamat Parkir</label>
                      <textarea
                        value={generalSettings.parking_address}
                        onChange={(e) => updateGeneral('parking_address', e.target.value)}
                        placeholder="Jl. Contoh No. 123, Jakarta"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <p className="text-xs text-gray-400 mt-1">Dicetak di bawah nama parkir pada tiket</p>
                    </div>
                  </div>
                </div>

                {/* Capacity */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                      <i className="fas fa-car text-green-500"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Kapasitas Parkir</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Tiket baru tidak dapat dibuat jika kapasitas sudah penuh</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          <i className="fas fa-motorcycle text-amber-600 mr-1" aria-hidden />
                          Kapasitas motor
                        </label>
                        <input
                          type="number" min="1" max="9999"
                          value={generalSettings.max_capacity_motorcycle}
                          onChange={(e) => updateGeneral('max_capacity_motorcycle', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-400 mt-1">Maks. sepeda motor aktif bersamaan</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          <i className="fas fa-car text-sky-600 mr-1" aria-hidden />
                          Kapasitas mobil
                        </label>
                        <input
                          type="number" min="1" max="9999"
                          value={generalSettings.max_capacity_car}
                          onChange={(e) => updateGeneral('max_capacity_car', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-400 mt-1">Maks. mobil aktif bersamaan</p>
                      </div>
                    </div>
                    {(motoPct !== null || carPct !== null) && (
                      <div className="flex flex-wrap gap-6 justify-center sm:justify-start pt-2">
                        {motoPct !== null && (
                          <div className="text-center">
                            <div className={`w-20 h-20 rounded-full flex flex-col items-center justify-center border-4 ${motoPct >= 90 ? 'border-red-400 bg-red-50' :
                              motoPct >= 70 ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50'
                              }`}>
                              <span className={`text-lg font-bold leading-none ${motoPct >= 90 ? 'text-red-600' :
                                motoPct >= 70 ? 'text-amber-600' : 'text-green-600'
                                }`}>{motoPct}%</span>
                              <span className="text-[10px] text-gray-500 mt-0.5">motor</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1.5">
                              {activeByType.motorcycle} / {capMotoNum}
                            </p>
                          </div>
                        )}
                        {carPct !== null && (
                          <div className="text-center">
                            <div className={`w-20 h-20 rounded-full flex flex-col items-center justify-center border-4 ${carPct >= 90 ? 'border-red-400 bg-red-50' :
                              carPct >= 70 ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50'
                              }`}>
                              <span className={`text-lg font-bold leading-none ${carPct >= 90 ? 'text-red-600' :
                                carPct >= 70 ? 'text-amber-600' : 'text-green-600'
                                }`}>{carPct}%</span>
                              <span className="text-[10px] text-gray-500 mt-0.5">mobil</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1.5">
                              {activeByType.car} / {capCarNum}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {((motoPct != null && motoPct >= 90) || (carPct != null && carPct >= 90)) && (
                      <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                        <i className="fas fa-exclamation-triangle mr-1.5"></i>
                        Salah satu jenis kapasitas hampir penuh — tiket baru untuk tipe tersebut akan diblokir saat slot penuh.
                      </div>
                    )}
                  </div>
                </div>

                {/* Activity Logs */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                          <i className="fas fa-history text-purple-600"></i>
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm text-gray-900">Riwayat Aktivitas</h3>
                          <p className="text-xs text-gray-500 mt-0.5">Log semua aktivitas sistem dan pengguna</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5">
                      <button
                        onClick={() => setShowActivityLogs(true)}
                        className="w-full px-4 py-3 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors flex items-center justify-center gap-2 font-medium"
                      >
                        <i className="fas fa-external-link-alt"></i>Tampilkan Semua Log
                      </button>
                    </div>
                  </div>
                </div>

                {/* FIX 1: Save / Cancel buttons now live INSIDE the general tab block */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => { loadGeneral(); setGeneralDirty(false); }}
                    disabled={!generalDirty}
                    className="px-5 py-2.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40 transition-colors"
                  >
                    Batalkan Perubahan
                  </button>
                  <button
                    onClick={handleSaveGeneral}
                    disabled={!generalDirty || savingGeneral}
                    className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
                  >
                    {savingGeneral ? (
                      <><i className="fas fa-spinner fa-spin"></i>Menyimpan…</>
                    ) : (
                      <><i className="fas fa-save"></i>Simpan Pengaturan</>
                    )}
                  </button>
                </div>
              </div>
            )
          )}

          {/* ── Rates Tab ── */}
          {activeTab === 'rates' && (
            loading ? <Loading text="Memuat..." /> : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rates.map((rate) => {
                    const toggles = rateToggles[rate.vehicleType] || { lostTicketFeeEnabled: false, dailyMaxEnabled: false };
                    // All cards share the same expanded state
                    const isExpanded = rateCardsExpanded;
                    const isDirty = rateCardDirty[rate.vehicleType] || false;

                    return (
                      <div key={rate.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                        {/* Header */}
                        <button
                          type="button"
                          onClick={() => setRateCardsExpanded(prev => !prev)}
                          className="w-full px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <i className={`fas text-sm ${rate.vehicleType === 'motorcycle' ? 'fa-motorcycle' : 'fa-car'} text-blue-600`}></i>
                            </div>
                            <div className="text-left">
                              <h3 className="font-semibold text-xs text-gray-900">{vehicleTypeMap[rate.vehicleType]}</h3>
                              <p className="text-xs text-gray-500">Rp {parseInt(rate.ratePerHour || 0).toLocaleString('id-ID')}/jam</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isDirty && (
                              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Berubah</span>
                            )}
                            <i className={`fas fa-chevron-down text-sm text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}></i>
                          </div>
                        </button>

                        {/* Expandable content */}
                        {isExpanded && (
                          <div className="p-4 space-y-3 border-t border-gray-100">
                            {/* Rate per Hour */}
                            <div>
                              <label className="block text-xs text-gray-500 font-medium mb-1">Tarif per Jam (Rp)</label>
                              <input
                                type="number" step="500" min="0"
                                value={rateEditValues[rate.vehicleType]?.ratePerHour || 0}
                                onChange={(e) => {
                                  setRateEditValues(prev => ({
                                    ...prev,
                                    [rate.vehicleType]: { ...prev[rate.vehicleType], ratePerHour: parseInt(e.target.value) || 0 }
                                  }));
                                  setRateCardDirty(prev => ({ ...prev, [rate.vehicleType]: true }));
                                }}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Grace Period */}
                            <div>
                              <label className="block text-xs text-gray-500 font-medium mb-1">Waktu Toleransi (menit)</label>
                              <input
                                type="number" step="1" min="0"
                                value={rateEditValues[rate.vehicleType]?.gracePeriodMinutes || 0}
                                onChange={(e) => {
                                  setRateEditValues(prev => ({
                                    ...prev,
                                    [rate.vehicleType]: { ...prev[rate.vehicleType], gracePeriodMinutes: parseInt(e.target.value) || 0 }
                                  }));
                                  setRateCardDirty(prev => ({ ...prev, [rate.vehicleType]: true }));
                                }}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Daily Max Toggle */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-gray-700">Maksimum Harian</label>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={toggles.dailyMaxEnabled}
                                  onClick={() => handleToggleRateOption(rate.vehicleType, 'dailyMaxEnabled')}
                                  className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${toggles.dailyMaxEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                                >
                                  <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white transition ${toggles.dailyMaxEnabled ? 'translate-x-3' : 'translate-x-0'}`} />
                                </button>
                              </div>
                              {toggles.dailyMaxEnabled && (
                                <input
                                  type="number" step="500" min="0"
                                  value={rateEditValues[rate.vehicleType]?.dailyMax || 0}
                                  onChange={(e) => {
                                    setRateEditValues(prev => ({
                                      ...prev,
                                      [rate.vehicleType]: { ...prev[rate.vehicleType], dailyMax: parseInt(e.target.value) || 0 }
                                    }));
                                    setRateCardDirty(prev => ({ ...prev, [rate.vehicleType]: true }));
                                  }}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Maksimum per hari"
                                />
                              )}
                            </div>

                            {/* Lost Ticket Fee Toggle */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-gray-700">Biaya Tiket Hilang</label>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={toggles.lostTicketFeeEnabled}
                                  onClick={() => handleToggleRateOption(rate.vehicleType, 'lostTicketFeeEnabled')}
                                  className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${toggles.lostTicketFeeEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                                >
                                  <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white transition ${toggles.lostTicketFeeEnabled ? 'translate-x-3' : 'translate-x-0'}`} />
                                </button>
                              </div>
                              {toggles.lostTicketFeeEnabled && (
                                <input
                                  type="number" step="1000" min="0"
                                  value={rateEditValues[rate.vehicleType]?.lostTicketFee || 0}
                                  onChange={(e) => {
                                    setRateEditValues(prev => ({
                                      ...prev,
                                      [rate.vehicleType]: { ...prev[rate.vehicleType], lostTicketFee: parseInt(e.target.value) || 0 }
                                    }));
                                    setRateCardDirty(prev => ({ ...prev, [rate.vehicleType]: true }));
                                  }}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Biaya tiket hilang"
                                />
                              )}
                            </div>

                            <button
                              onClick={() => handleSaveRate(rate)}
                              disabled={savingRate[rate.vehicleType] || !isDirty}
                              className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                            >
                              {savingRate[rate.vehicleType] ? (
                                <><i className="fas fa-spinner fa-spin text-xs"></i>Menyimpan...</>
                              ) : (
                                <><i className="fas fa-save text-xs"></i>Simpan</>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Global Lost Ticket Fee */}
                {/* FIX 3: locked description text changed to amber-700 for readability */}
                <div className={`bg-white rounded-xl shadow-sm overflow-hidden border-2 ${isGlobalFeeLocked() ? 'border-gray-200 opacity-60' : 'border-red-100'}`}>
                  <div className={`px-5 py-4 border-b flex items-center gap-3 ${isGlobalFeeLocked() ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isGlobalFeeLocked() ? 'bg-amber-50' : 'bg-red-100'}`}>
                      <i className={`fas fa-exclamation-circle ${isGlobalFeeLocked() ? 'text-amber-500' : 'text-red-600'}`}></i>
                    </div>
                    <div>
                      <h3 className={`font-semibold text-sm ${isGlobalFeeLocked() ? 'text-gray-700' : 'text-gray-900'}`}>
                        Biaya Tiket Hilang Global
                      </h3>
                      {/* FIX 3: was text-gray-400 (nearly invisible) — now amber-700 when locked */}
                      <p className={`text-xs mt-0.5 ${isGlobalFeeLocked() ? 'text-amber-700' : 'text-gray-500'}`}>
                        {isGlobalFeeLocked()
                          ? 'Nonaktifkan semua biaya tiket hilang per kendaraan untuk mengaktifkan'
                          : 'Fallback jika biaya per kendaraan dinonaktifkan'}
                      </p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 font-medium mb-1.5">Biaya Tiket Hilang (Rp)</label>
                      <input
                        type="number" step="1000" min="0"
                        value={globalLostFee}
                        onChange={(e) => setGlobalLostFee(parseInt(e.target.value) || 0)}
                        disabled={isGlobalFeeLocked()}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        placeholder="50000"
                      />
                      <p className="text-xs text-gray-400 mt-1">Format: Rp {parseInt(globalLostFee || 0).toLocaleString('id-ID')}</p>
                    </div>
                    <button
                      onClick={handleSaveGlobalLostFee}
                      disabled={savingGlobalFee || isGlobalFeeLocked()}
                      className="w-full px-4 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {savingGlobalFee ? (
                        <><i className="fas fa-spinner fa-spin"></i>Menyimpan...</>
                      ) : (
                        <><i className="fas fa-save"></i>Simpan Biaya Global</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          )}

          {/* ── Users Tab ── */}
          {activeTab === 'users' && (
            loading ? <Loading text="Memuat..." /> : (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto text-sm">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {['Pengguna', 'Nama', 'Role', 'Status', 'Aksi'].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 font-medium text-xs">{user.username}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-600">{user.fullName || '-'}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {roleMap[user.role] || user.role}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {user.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => handleToggleUser(user)}
                              className={`text-xs font-medium ${user.isActive ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}`}
                            >
                              {user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* ── Regulations Tab ── */}
          {activeTab === 'regulations' && (
            regulationsLoading ? <Loading text="Memuat regulasi..." /> : (
              <div className="space-y-5">
                {regulationDirty && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-amber-700 text-sm">
                      <i className="fas fa-circle text-amber-400 text-xs"></i>
                      Ada perubahan yang belum disimpan
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancelRegulations}
                        className="text-xs text-amber-700 hover:text-amber-800 font-medium"
                      >
                        Batalkan
                      </button>
                      <button
                        onClick={handleSaveRegulations}
                        disabled={savingRegulations}
                        className="text-xs px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                      >
                        Simpan Sekarang
                      </button>
                    </div>
                  </div>
                )}

                {/* Auto-Mark-Lost Card */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                      <i className="fas fa-clock text-red-500"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Regulasi Tiket Hilang Otomatis</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Tiket aktif akan otomatis ditandai hilang berdasarkan waktu batas yang ditentukan
                      </p>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    <ToggleSwitch
                      checked={regulations.autoMarkLost.enabled}
                      onChange={(v) => updateRegulation('autoMarkLost', 'enabled', v)}
                      label="Aktifkan regulasi auto-mark hilang"
                      description="Sistem akan otomatis menandai tiket aktif sebagai hilang sesuai jadwal yang dipilih"
                    />

                    <div className={`space-y-5 transition-opacity ${regulations.autoMarkLost.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-2">Mode Regulasi</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            onClick={() => updateRegulation('autoMarkLost', 'mode', 'daily')}
                            className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${regulations.autoMarkLost.mode === 'daily'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white hover:border-blue-200'
                              }`}
                          >
                            <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${regulations.autoMarkLost.mode === 'daily' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                              <i className={`fas fa-redo text-sm ${regulations.autoMarkLost.mode === 'daily' ? 'text-blue-600' : 'text-gray-500'}`}></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${regulations.autoMarkLost.mode === 'daily' ? 'text-blue-700' : 'text-gray-800'}`}>Harian (Berulang)</p>
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                                Jalankan setiap hari pada jam yang sama secara otomatis
                              </p>
                            </div>
                            {regulations.autoMarkLost.mode === 'daily' && (
                              <i className="fas fa-check-circle text-blue-500 text-sm absolute top-3 right-3"></i>
                            )}
                          </button>

                          <button
                            onClick={() => updateRegulation('autoMarkLost', 'mode', 'scheduled')}
                            className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${regulations.autoMarkLost.mode === 'scheduled'
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-gray-200 bg-white hover:border-amber-200'
                              }`}
                          >
                            <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${regulations.autoMarkLost.mode === 'scheduled' ? 'bg-amber-100' : 'bg-gray-100'}`}>
                              <i className={`fas fa-calendar-alt text-sm ${regulations.autoMarkLost.mode === 'scheduled' ? 'text-amber-700' : 'text-gray-500'}`}></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${regulations.autoMarkLost.mode === 'scheduled' ? 'text-amber-900' : 'text-gray-800'}`}>Terjadwal (Satu Kali)</p>
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                                Jalankan satu kali pada tanggal &amp; jam tertentu
                              </p>
                            </div>
                            {regulations.autoMarkLost.mode === 'scheduled' && (
                              <i className="fas fa-check-circle text-amber-600 text-sm absolute top-3 right-3"></i>
                            )}
                          </button>
                        </div>
                      </div>

                      {regulations.autoMarkLost.mode === 'daily' && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-900 mb-1">
                              <i className="fas fa-clock text-blue-500 mr-1.5"></i>Jam Batas Harian
                            </label>
                            <p className="text-xs text-gray-500 mb-3">
                              Setiap hari pada jam ini, semua tiket aktif yang masuk{' '}
                              <strong>sebelum jam tersebut</strong> akan ditandai hilang.
                            </p>
                            <div className="flex items-center gap-3 flex-wrap">
                              <input
                                type="time"
                                value={regulations.autoMarkLost.cutoffTime}
                                onChange={(e) => updateRegulation('autoMarkLost', 'cutoffTime', e.target.value)}
                                className="px-3 py-2 text-sm border border-blue-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <span className="text-xs text-gray-600">
                                Setiap hari pukul <strong className="text-blue-700">{regulations.autoMarkLost.cutoffTime} WIB</strong>
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                              {[
                                { label: 'Subuh (05:00)', value: '05:00' },
                                { label: 'Pagi (07:00)', value: '07:00' },
                                { label: 'Pagi (08:00)', value: '08:00' },
                                { label: 'Siang (12:00)', value: '12:00' },
                                { label: 'Tengah malam (00:00)', value: '00:00' },
                              ].map(({ label, value }) => (
                                <button
                                  key={value}
                                  onClick={() => updateRegulation('autoMarkLost', 'cutoffTime', value)}
                                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${regulations.autoMarkLost.cutoffTime === value
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                    }`}
                                >{label}</button>
                              ))}
                            </div>
                          </div>
                          <div className="bg-white border border-blue-100 rounded-lg p-3 text-xs text-blue-800">
                            <i className="fas fa-info-circle mr-1.5 text-blue-500"></i>
                            Sistem memeriksa setiap <strong>60 detik</strong>. Setiap hari pukul{' '}
                            <strong>{regulations.autoMarkLost.cutoffTime}</strong>, semua tiket aktif yang
                            masuk sebelum jam tersebut akan otomatis ditandai hilang.
                          </div>
                        </div>
                      )}

                      {regulations.autoMarkLost.mode === 'scheduled' && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-900 mb-1">
                              <i className="fas fa-calendar-alt text-amber-600 mr-1.5"></i>
                              Tanggal &amp; Waktu Eksekusi
                            </label>
                            <p className="text-xs text-gray-500 mb-3">
                              Pada tanggal dan jam ini, semua tiket aktif yang masuk{' '}
                              <strong>sebelum waktu tersebut</strong> akan otomatis ditandai hilang.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1 font-medium">Tanggal</label>
                                <input
                                  type="date" min={getTodayStr()}
                                  value={regulations.autoMarkLost.scheduledDate}
                                  onChange={(e) => updateRegulation('autoMarkLost', 'scheduledDate', e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-amber-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1 font-medium">Jam</label>
                                <input
                                  type="time"
                                  value={regulations.autoMarkLost.scheduledTime}
                                  onChange={(e) => updateRegulation('autoMarkLost', 'scheduledTime', e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-amber-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                            </div>
                            <div className="mt-3">
                              <p className="text-xs text-gray-500 mb-2">Preset jam:</p>
                              <div className="flex flex-wrap gap-2">
                                {['07:00', '08:00', '12:00', '17:00', '00:00'].map((value) => (
                                  <button
                                    key={value}
                                    onClick={() => updateRegulation('autoMarkLost', 'scheduledTime', value)}
                                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${regulations.autoMarkLost.scheduledTime === value
                                      ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                                      : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
                                      }`}
                                  >{value}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                          {scheduledPreview ? (
                            <div className={`flex items-start gap-2.5 rounded-lg p-3 text-xs border ${scheduledPreview.isPast
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : 'bg-white border-amber-100 text-amber-900'
                              }`}>
                              <i className={`fas mt-0.5 ${scheduledPreview.isPast ? 'fa-exclamation-triangle text-red-500' : 'fa-calendar-check text-amber-600'}`}></i>
                              <span>
                                {scheduledPreview.isPast ? (
                                  <><strong>Peringatan:</strong> Tanggal yang dipilih sudah lewat. Regulasi akan segera aktif dan menandai tiket saat ini.</>
                                ) : (
                                  <>Semua tiket aktif yang masuk sebelum <strong>{scheduledPreview.dt.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong> akan otomatis ditandai hilang.</>
                                )}
                              </span>
                            </div>
                          ) : (
                            <div className="bg-white border border-amber-100 rounded-lg p-3 text-xs text-gray-500">
                              <i className="fas fa-info-circle mr-1.5 text-amber-500"></i>
                              Pilih tanggal dan jam eksekusi untuk melihat pratinjau.
                            </div>
                          )}
                        </div>
                      )}

                      {regulations.autoMarkLost.enabled && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-2 text-xs text-gray-700">
                          <i className="fas fa-shield-alt text-gray-400 mt-0.5"></i>
                          <span>{describeAutoMarkRule(regulations)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Auto-Report Card */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                      <i className="fas fa-file-alt text-blue-500"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Laporan Otomatis</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Notifikasi laporan tiket hilang akan muncul di dashboard secara terjadwal
                      </p>
                    </div>
                  </div>
                  <div className="p-5 space-y-5">
                    <ToggleSwitch
                      checked={regulations.autoReport.enabled}
                      onChange={(v) => updateRegulation('autoReport', 'enabled', v)}
                      label="Aktifkan laporan otomatis"
                      description="Dashboard akan otomatis menampilkan laporan tiket hilang pada waktu yang ditentukan setiap hari"
                    />
                    <div className={`space-y-4 transition-opacity ${regulations.autoReport.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1.5">Waktu Laporan Harian</label>
                        <p className="text-xs text-gray-500 mb-2">
                          Laporan tiket hilang akan muncul otomatis di dashboard setiap hari pada waktu ini.
                        </p>
                        <div className="flex items-center gap-3">
                          <input
                            type="time"
                            value={regulations.autoReport.reportTime}
                            onChange={(e) => updateRegulation('autoReport', 'reportTime', e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-500">
                            Setiap hari pukul <strong>{regulations.autoReport.reportTime}</strong> WIB
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {[
                            { label: 'Pagi (07:00)', value: '07:00' },
                            { label: 'Pagi (08:00)', value: '08:00' },
                            { label: 'Siang (12:00)', value: '12:00' },
                            { label: 'Sore (17:00)', value: '17:00' },
                            { label: 'Malam (20:00)', value: '20:00' },
                          ].map(({ label, value }) => (
                            <button
                              key={value}
                              onClick={() => updateRegulation('autoReport', 'reportTime', value)}
                              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${regulations.autoReport.reportTime === value
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                }`}
                            >{label}</button>
                          ))}
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                        <i className="fas fa-info-circle mr-1.5"></i>
                        Laporan hanya muncul <strong>sekali per hari</strong> per perangkat. Sistem memeriksa jadwal setiap 60 detik.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-red-100">
                  <div className="px-5 py-4 border-b border-red-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                      <i className="fas fa-exclamation-triangle text-red-500"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-red-700">Zona Bahaya</h3>
                      <p className="text-xs text-red-400 mt-0.5">Tindakan ini bersifat permanen atau tidak dapat dibatalkan</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Reset tracker laporan</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Memaksa laporan otomatis muncul kembali hari ini jika waktu sudah lewat
                        </p>
                      </div>
                      <button
                        onClick={handleClearReportTracker}
                        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        <i className="fas fa-redo mr-1"></i>Reset
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-red-800">Reset semua regulasi</p>
                        <p className="text-xs text-red-500 mt-0.5">Kembalikan semua pengaturan regulasi ke nilai default</p>
                      </div>
                      <button
                        onClick={handleResetRegulations}
                        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <i className="fas fa-undo mr-1"></i>Reset Default
                      </button>
                    </div>
                  </div>
                </div>

                {/* FIX 1: these buttons now live INSIDE the regulations tab block */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={handleCancelRegulations}
                    disabled={!regulationDirty}
                    className="px-5 py-2.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40 transition-colors"
                  >
                    Batalkan Perubahan
                  </button>
                  <button
                    onClick={handleSaveRegulations}
                    disabled={!regulationDirty || savingRegulations}
                    className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
                  >
                    {savingRegulations ? (
                      <><i className="fas fa-spinner fa-spin"></i>Menyimpan…</>
                    ) : (
                      <><i className="fas fa-save"></i>Simpan Regulasi</>
                    )}
                  </button>
                </div>
              </div>
            )
          )}

          {/* ── Database Tab ── */}
          {activeTab === 'database' && (
            loading ? <Loading text="Memuat..." /> : (
              <div className="space-y-6">

                {/* Manual Backup */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                      <i className="fas fa-download text-blue-500"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Backup Database</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Mencadangkan seluruh data sistem ke dalam file ZIP</p>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-gray-700">Buat file backup baru secara manual.</p>
                      <p className="text-xs text-gray-500 mt-1">Pastikan Anda menyimpan file ini di tempat yang aman.</p>
                    </div>
                    <button
                      onClick={handleManualBackup}
                      disabled={backupLoading}
                      className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      {backupLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-export"></i>}
                      {backupLoading ? 'Memproses...' : 'Backup Sekarang'}
                    </button>
                  </div>
                </div>

                {/* Import / Restore */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-amber-100">
                  <div className="px-5 py-4 border-b border-amber-50 bg-amber-50 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                      <i className="fas fa-upload text-amber-600"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-amber-900">Restore Database</h3>
                      <p className="text-xs text-amber-700 mt-0.5">Memulihkan data sistem dari file backup (.zip)</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-100 text-xs text-amber-800 flex items-start gap-2">
                      <i className="fas fa-exclamation-triangle mt-0.5 text-amber-600"></i>
                      <span><strong>Peringatan:</strong> Proses restore <strong>akan menimpa dan menghapus</strong> semua data yang ada di database sistem saat ini. Tidak dapat dibatalkan.</span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Pilih File Backup (ZIP)</label>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="file"
                          accept=".zip,application/zip,application/x-zip-compressed"
                          onChange={(e) => setImportFile(e.target.files[0])}
                          className="flex-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 border border-gray-200 rounded-lg"
                        />
                        <button
                          onClick={handleImport}
                          disabled={!importFile || importLoading}
                          className="px-5 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                          {importLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-import"></i>}
                          {importLoading ? 'Memulihkan...' : 'Restore Data'}
                        </button>
                      </div>
                      {importFile && (
                        <p className="text-xs text-gray-500 mt-2">File terpilih: {importFile.name} ({(importFile.size / 1024).toFixed(2)} KB)</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Auto Backup Config */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                      <i className="fas fa-sync-alt text-green-500"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Backup Otomatis</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Mengaktifkan pencadangan berjalan secara berkala</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-5">
                    <ToggleSwitch
                      checked={autoBackupConfig.isEnabled}
                      onChange={(v) => setAutoBackupConfig(prev => ({ ...prev, isEnabled: v }))}
                      label="Aktifkan Backup Otomatis"
                      description="Sistem akan menyalin database sesuai dengan interval yang ditentukan."
                    />

                    <div className={`transition-opacity ${autoBackupConfig.isEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Interval Waktu Backup</label>
                      <select
                        value={autoBackupConfig.interval}
                        onChange={(e) => setAutoBackupConfig(prev => ({ ...prev, interval: e.target.value }))}
                        className="w-full md:w-1/3 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="daily">Harian (Setiap Hari)</option>
                        <option value="weekly">Mingguan (Setiap Minggu)</option>
                        <option value="monthly">Bulanan (Setiap Bulan)</option>
                      </select>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-gray-100">
                      <button
                        onClick={handleSaveAutoBackup}
                        disabled={savingAutoBackup}
                        className="px-5 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                      >
                        {savingAutoBackup ? <><i className="fas fa-spinner fa-spin"></i> Menyimpan...</> : <><i className="fas fa-save"></i> Simpan Pengaturan</>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status Card */}
                {backupStatus && (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Status Backup Terakhir</h4>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                        <i className="far fa-calendar-alt"></i>
                        <span>
                          {backupStatus.lastBackupAt
                            ? new Date(backupStatus.lastBackupAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
                            : 'Belum pernah dibackup'}
                        </span>
                      </div>
                      {backupStatus.lastBackupFile && (
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                          <i className="far fa-file-code"></i>
                          <span>{backupStatus.lastBackupFile}</span>
                        </div>
                      )}
                    </div>
                    {backupStatus.lastBackupStatus && (
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${backupStatus.lastBackupStatus === 'success' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
                        }`}>
                        {backupStatus.lastBackupStatus === 'success' ? 'Berhasil' : 'Gagal'}
                      </span>
                    )}
                  </div>
                )}

              </div>
            )
          )}

          <ActivityLogsModal
            isOpen={activeTab === 'general' && showActivityLogs}
            onClose={() => setShowActivityLogs(false)}
          />
        </div>
      </div>
    </div>
  );
};

export default Settings;