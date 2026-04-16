import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import Sidebar from '../components/common/Sidebar';
import Loading from '../components/common/Loading';
import { ticketService } from '../services/api';
import { showError, showConfirm, showSuccess } from '../utils/alerts';
import {
  fetchRegulations,
  DEFAULT_REGULATIONS,
  shouldMarkTicketLost,
  formatDuration,
  describeAutoMarkRule,
} from '../utils/regulations';
import {
  getCachedRegulations,
  getCachedActiveTickets,
  invalidateActiveTicketsCache,
} from '../utils/dashboardCache';
import { applyAllFilters } from '../utils/filterUtils';

const KEBAB_MENU_WIDTH_PX = 176; // ~11rem

const vehicleTypeMap = {
  car: 'Mobil',
  motorcycle: 'Sepeda Motor',
};

const vehicleTypes = ['car', 'motorcycle'];

const getVehicleIcon = (type) => ({
  motorcycle: 'fa-motorcycle', car: 'fa-car'
}[type] || 'fa-car');

const getVehicleBadgeColor = (type) => ({
  motorcycle: 'bg-amber-100 text-amber-800',
  car: 'bg-sky-100 text-sky-800',
}[type] || 'bg-gray-100 text-gray-700');

const toImageUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

// Stable reference outside the component the cache layer uses this as the
// fetcher but only actually calls it when the 20s TTL has expired.
async function fetchActiveTicketsData() {
  const [activeRes, lostRes] = await Promise.all([
    ticketService.getActive(),
    ticketService.search({ status: 'lost', limit: 100 }),
  ]);
  return {
    activeTickets: activeRes.data.success ? (activeRes.data.data.tickets || []) : [],
    lostTickets: lostRes.data.success ? (lostRes.data.data.tickets || []) : [],
  };
}

const ActiveTickets = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [lostTickets, setLostTickets] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [autoMarkingCount, setAutoMarkingCount] = useState(0);

  // Basic search/filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');

  // Advanced filter states
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [durationRanges, setDurationRanges] = useState([]);
  const [entryDateFrom, setEntryDateFrom] = useState(null);
  const [entryDateTo, setEntryDateTo] = useState(null);

  // Kebab menu: open row id + fixed position for portaled panel
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [kebabMenuPosition, setKebabMenuPosition] = useState(null);

  // Copy tooltip state
  const [copiedTicketId, setCopiedTicketId] = useState(null);

  // Download state
  const [downloadingId, setDownloadingId] = useState(null);

  // Entry image state
  const [entryImageUrl, setEntryImageUrl] = useState(null);

  const regulationsRef = useRef(DEFAULT_REGULATIONS);
  const kebabButtonRef = useRef(null);
  const kebabMenuPanelRef = useRef(null);
  const [regulationsReady, setRegulationsReady] = useState(false);

  // Load regulations via cache (5-min TTL)
  useEffect(() => {
    getCachedRegulations(fetchRegulations).then(({ regs }) => {
      regulationsRef.current = regs;
      setRegulationsReady(true);
    });
  }, []);

  // Data fetching via cache (20-s TTL)
  // `force = true` bypasses the TTL used after mutations so the user sees
  // the updated list immediately.  Background poll passes force=false so it
  // re-uses cached data if the page was visited less than 20s ago.
  const fetchTickets = useCallback(async (silent = false, force = false) => {
    try {
      if (!silent) setLoading(true);
      const { activeTickets, lostTickets: lost } = await getCachedActiveTickets(
        fetchActiveTicketsData,
        force,
      );
      setTickets(activeTickets);
      setLostTickets(lost);
    } catch (error) {
      showError('Gagal memuat tiket');
      console.error(error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Mount: fetch data on page load
  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Auto-Mark-Lost Engine
  // Uses getCachedRegulations so it never causes an extra API call; the 5-min
  // TTL is intentional — regulation changes rarely and 5 minutes is fine.
  const runAutoMarkLost = useCallback(async () => {
    const { regs: regulations } = await getCachedRegulations(fetchRegulations);
    regulationsRef.current = regulations;

    if (!regulations.autoMarkLost.enabled) return;

    const stale = tickets.filter((t) => shouldMarkTicketLost(t, regulations));
    if (stale.length === 0) return;

    setAutoMarkingCount(stale.length);

    const results = await Promise.allSettled(
      stale.map((t) =>
        ticketService.markLost(t.id, {
          verificationMethod: 'Auto-regulation (cutoff time exceeded)',
        })
      )
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    if (succeeded > 0) {
      const r = regulations.autoMarkLost;
      const ruleDesc =
        r.mode === 'daily'
          ? `batas jam ${r.cutoffTime}`
          : `jadwal ${r.scheduledDate} ${r.scheduledTime}`;
      showSuccess(`${succeeded} tiket otomatis ditandai hilang (melewati ${ruleDesc})`);
      // Invalidate so the next fetch reflects the newly-marked tickets
      invalidateActiveTicketsCache();
      await fetchTickets(true, true);
    }

    setAutoMarkingCount(0);
  }, [tickets, fetchTickets]);

  useEffect(() => {
    if (!regulationsReady) return;
    // Run auto-mark once on mount
    runAutoMarkLost();
  }, [runAutoMarkLost, regulationsReady]);

  // Position portaled kebab menu under trigger (capture phase scroll: any scrollable ancestor)
  useLayoutEffect(() => {
    if (expandedTicketId == null) {
      setKebabMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      const el = kebabButtonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setKebabMenuPosition({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - KEBAB_MENU_WIDTH_PX),
      });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [expandedTicketId]);

  // Close kebab menu on outside click (trigger + portaled panel)
  useEffect(() => {
    if (expandedTicketId == null) return;
    const onPointerDown = (e) => {
      if (
        kebabButtonRef.current?.contains(e.target) ||
        kebabMenuPanelRef.current?.contains(e.target)
      ) {
        return;
      }
      setExpandedTicketId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [expandedTicketId]);

  // Fetch entry image when modal opens
  useEffect(() => {
    const loadEntryImage = async () => {
      if (showModal && selectedTicket) {
        if (selectedTicket.entryImagePath) {
          setEntryImageUrl(toImageUrl(selectedTicket.entryImagePath));
          return;
        }
        try {
          const response = await ticketService.get(selectedTicket.id);
          const path = response.data?.data?.ticket?.entryImagePath;
          setEntryImageUrl(toImageUrl(path));
        } catch (error) {
          console.error('Failed to load entry image:', error);
          setEntryImageUrl(null);
        }
      } else {
        setEntryImageUrl(null);
      }
    };
    loadEntryImage();
  }, [showModal, selectedTicket]);

  // Filtering & Sorting
  const filterTickets = useCallback((ticketsToFilter) => {
    return applyAllFilters(ticketsToFilter, {
      searchTerm,
      vehicleType: vehicleFilter,
      dateFilter,
      durationRanges,
      entryDateFrom,
      entryDateTo,
      sortBy
    });
  }, [searchTerm, vehicleFilter, dateFilter, durationRanges, entryDateFrom, entryDateTo, sortBy]);

  // Actions
  const handleMarkLost = async (ticket) => {
    const result = await showConfirm(
      `Tandai tiket ${ticket.ticketNumber} sebagai hilang?`, 'Konfirmasi', 'Ya, Tandai', 'Batal'
    );
    if (!result.isConfirmed) return;
    try {
      await ticketService.markLost(ticket.id, { verificationMethod: 'Manual verification' });
      showSuccess('Tiket ditandai sebagai hilang');
      invalidateActiveTicketsCache();
      await fetchTickets(true, true);
    } catch {
      showError('Gagal memperbarui tiket');
    }
  };

  const handleDeleteLostTicket = async (ticket) => {
    const result = await showConfirm(
      `Hapus tiket hilang ${ticket.ticketNumber} secara permanen?`, 'Hapus Tiket', 'Ya, Hapus', 'Batal'
    );
    if (!result.isConfirmed) return;
    setDeletingId(ticket.id);
    try {
      await ticketService.delete(ticket.id);
      showSuccess('Tiket berhasil dihapus');
      invalidateActiveTicketsCache();
      await fetchTickets(true, true);
    } catch {
      showError('Gagal menghapus tiket');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAllLost = async () => {
    setDeletingAll(true);
    try {
      const results = await Promise.allSettled(lostTickets.map((t) => ticketService.delete(t.id)));
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      if (succeeded > 0)
        showSuccess(`${succeeded} tiket hilang berhasil dihapus${failed > 0 ? `, ${failed} gagal` : ''}`);
      else showError('Semua penghapusan gagal');
      setShowDeleteAllModal(false);
      invalidateActiveTicketsCache();
      await fetchTickets(true, true);
    } catch {
      showError('Gagal menghapus tiket');
    } finally {
      setDeletingAll(false);
    }
  };

  // Download ticket as image (PNG) - using TicketPrint design
  const handleDownloadTicketImage = async (ticket) => {
    try {
      setDownloadingId(ticket.id);
      const response = await ticketService.print(ticket.id);
      if (response.data.success) {
        const ticketData = response.data.data;
        const parkingInfo = { name: ticketData.parkingName || 'ParkHere', address: ticketData.parkingAddress || '' };

        // Dynamically import html2canvas and JsBarcode
        const html2canvas = (await import('html2canvas')).default;

        // Build ticket HTML matching TicketPrint design
        const vehicleLabel = {
          car: 'Mobil',
          motorcycle: 'Motor',
        }[ticketData.vehicleType] || ticketData.vehicleType;

        const entryTime = new Date(ticketData.entryTime);
        const time = entryTime.toLocaleTimeString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const date = entryTime.toLocaleDateString('id-ID', {
          timeZone: 'Asia/Jakarta',
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

        const barcodeValue = ticketData.ticketNumber || '';

        // Create container div
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:250px;background:white;padding:15px;';
        
        const html = `
          <div style="font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;width:100%;color:#222;text-align:center;">
            <div style="font-size:15px;font-weight:800;letter-spacing:0.4px;margin-bottom:5px;color:#111;">${parkingInfo.name}</div>
            ${parkingInfo.address ? `<div style="font-size:7.5px;color:#666;margin-bottom:10px;">${parkingInfo.address}</div>` : ''}
            <hr style="border:none;border-top:1.5px solid #222;margin:10px 0;"/>
            <div style="font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#444;margin-bottom:5px;">Tiket Parkir Masuk</div>
            <div style="font-size:20px;font-weight:900;letter-spacing:2px;color:#111;margin:5px 0;">${barcodeValue}</div>
            <hr style="border:none;border-top:1px dashed #aaa;margin:10px 0;"/>
            <table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:8.5px;">
              <tr><td style="color:#777;width:35%;padding:6px 0;text-align:left;">Jenis</td><td style="font-weight:600;color:#222;text-align:right;">${vehicleLabel}</td></tr>
              <tr><td style="color:#777;width:35%;padding:6px 0;text-align:left;">Jam Masuk</td><td style="font-weight:600;color:#222;text-align:right;">${time} WIB</td></tr>
              <tr><td style="color:#777;width:35%;padding:6px 0;text-align:left;">Tanggal</td><td style="font-weight:600;color:#222;text-align:right;">${date}</td></tr>
              ${ticketData.plateNumber && ticketData.plateNumber !== 'UNKNOWN' ? `<tr><td style="color:#777;width:35%;padding:6px 0;text-align:left;">Plat</td><td style="font-weight:600;color:#222;text-align:right;">${ticketData.plateNumber}</td></tr>` : ''}
            </table>
            <div style="margin-top:15px;padding-top:10px;border-top:1px dashed #aaa;text-align:center;">
              <svg id="ticket-barcode-svg" style="height:60px;width:100%;margin:0 auto;display:block;"></svg>
              <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:#333;margin-top:5px;font-family:'Courier New',monospace;">${barcodeValue}</div>
            </div>
            <div style="font-size:6.5px;text-align:center;color:#d00;margin-top:15px;padding:10px;border:1px solid #faa;border-radius:2px;background:#fff5f5;font-weight:700;letter-spacing:0.3px;">PERHATIAN: TIKET HILANG DIKENAKAN DENDA</div>
          </div>
        `;

        container.innerHTML = html;
        document.body.appendChild(container);

        // Wait a bit and then render barcode
        await new Promise(resolve => setTimeout(resolve, 100));

        // Render barcode
        const barcodeElement = container.querySelector('#ticket-barcode-svg');
        window.JsBarcode(barcodeElement, barcodeValue, {
          format: 'CODE128',
          width: 1.8,
          height: 60,
          displayValue: false,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000'
        });

        // Wait for barcode to render
        await new Promise(resolve => setTimeout(resolve, 500));

        // Capture with html2canvas
        const canvas = await html2canvas(container, {
          backgroundColor: '#ffffff',
          scale: 2,
          logging: false,
          useCORS: true,
          allowTaint: true,
          windowHeight: container.scrollHeight
        });

        // Download
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `ticket-${ticketData.ticketNumber}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        document.body.removeChild(container);

        showSuccess('Tiket berhasil diunduh sebagai gambar');
      }
    } catch (error) {
      console.error('Download error:', error);
      showError('Gagal mengunduh tiket sebagai gambar');
    } finally {
      setDownloadingId(null);
    }
  };

  // Direct to exit with ticket pre-populated
  const handleDirectToExit = (ticket) => {
    navigate('/exit', { state: { preselectedTicketNumber: ticket.ticketNumber } });
  };

  // Copy ticket number to clipboard
  const handleCopyTicketNumber = (ticketNumber) => {
    navigator.clipboard.writeText(ticketNumber);
    setCopiedTicketId(ticketNumber);
    showSuccess('Nomor tiket tersalin');
    setTimeout(() => setCopiedTicketId(null), 2000);
  };

  // Derived
  const filteredActiveTickets = filterTickets(tickets);
  const filteredLostTickets = filterTickets(lostTickets);
  const displayTickets = activeTab === 'active' ? filteredActiveTickets : filteredLostTickets;
  const regulations = regulationsRef.current;
  const openKebabTicket =
    expandedTicketId != null && activeTab === 'active'
      ? displayTickets.find((t) => t.id === expandedTicketId)
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-[#e8eef7] to-slate-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:ml-[260px]">
        <header className="bg-white/95 backdrop-blur-sm border-b border-slate-200/80 sticky top-0 z-10 shadow-sm shadow-slate-900/5">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
                <i className="fas fa-bars text-gray-600"></i>
              </button>
              <h1 className="text-lg font-bold text-slate-900 font-display tracking-tight">
                {activeTab === 'active' ? 'Tiket Aktif' : 'Tiket Hilang'}
              </h1>
            </div>
            {autoMarkingCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                <i className="fas fa-spinner fa-spin text-xs"></i>
                Menandai {autoMarkingCount} tiket hilang…
              </span>
            )}
            {regulations.autoMarkLost.enabled && (
              <span
                title={describeAutoMarkRule(regulations)}
                className="hidden sm:flex items-center gap-1 text-xs text-[#1e3a5f] bg-sky-50 px-2 py-1 rounded-full border border-sky-200/80 cursor-default"
              >
                <i className="fas fa-shield-alt text-xs"></i>
                Auto-regulasi aktif
                {regulations.autoMarkLost.mode === 'daily' && (
                  <span className="ml-1 font-semibold">{regulations.autoMarkLost.cutoffTime}</span>
                )}
                {regulations.autoMarkLost.mode === 'scheduled' && regulations.autoMarkLost.scheduledDate && (
                  <span className="ml-1 font-semibold">{regulations.autoMarkLost.scheduledDate}</span>
                )}
              </span>
            )}
          </div>
        </header>

        <div className="p-5">
          {/* Tabs */}
          <div className="flex items-center justify-between mb-5 border-b border-gray-200">
            <div className="flex gap-3">
              <button
                onClick={() => setActiveTab('active')}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'active' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
              >
                <i className="fas fa-ticket mr-1.5"></i>Aktif ({tickets.length})
              </button>
              <button
                onClick={() => setActiveTab('lost')}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'lost' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
              >
                <i className="fas fa-exclamation-circle mr-1.5"></i>
                Hilang ({lostTickets.length})
                {lostTickets.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full leading-none">
                    {lostTickets.length}
                  </span>
                )}
              </button>
            </div>
            {activeTab === 'lost' && lostTickets.length > 0 && (
              <button
                onClick={() => setShowDeleteAllModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                <i className="fas fa-trash-alt"></i>Hapus Semua ({lostTickets.length})
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl p-5 shadow-sm mb-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5"><i className="fas fa-search mr-1"></i>Cari</label>
              <input
                type="text" placeholder="Plat atau No. Tiket..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5"><i className="fas fa-car mr-1"></i>Jenis</label>
              <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">Semua Jenis</option>
                {vehicleTypes.map((t) => <option key={t} value={t}>{vehicleTypeMap[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5"><i className="fas fa-calendar mr-1"></i>Tanggal</label>
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">Semua Tanggal</option>
                <option value="today">Hari Ini</option>
                <option value="week">Minggu Ini</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5"><i className="fas fa-sort mr-1"></i>Urutkan</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="recent">Terbaru</option>
                <option value="oldest">Terlama</option>
                <option value="duration">Durasi Terlama</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="flex-1 px-3 py-1.5 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <i className={`fas fa-sliders-h text-xs`}></i>Lanjut
              </button>
              <button
                onClick={() => { invalidateActiveTicketsCache(); fetchTickets(false, true); }}
                disabled={loading}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-1.5"
              >
                <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>Refresh
              </button>
            </div>
          </div>

          {/* Advanced Filters Section */}
          {showAdvancedFilters && (
            <div className="bg-slate-50 rounded-xl p-5 shadow-sm mb-5 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <i className="fas fa-filter text-blue-500"></i> Filter Lanjutan
                </h3>
                <button
                  onClick={() => {
                    setDurationRanges([]);
                    setEntryDateFrom(null);
                    setEntryDateTo(null);
                  }}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Hapus Filter
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Duration Range Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Rentang Durasi</label>
                  <div className="space-y-2">
                    {['0-1h', '1-3h', '3-8h', '8h+'].map((range) => (
                      <label key={range} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={durationRanges.includes(range)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDurationRanges([...durationRanges, range]);
                            } else {
                              setDurationRanges(durationRanges.filter((r) => r !== range));
                            }
                          }}
                          className="rounded"
                        />
                        <span>{range}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Entry Date From */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Dari Tanggal Masuk</label>
                  <input
                    type="date"
                    value={entryDateFrom ? entryDateFrom.split('T')[0] : ''}
                    onChange={(e) => setEntryDateFrom(e.target.value ? new Date(e.target.value).toISOString() : null)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Entry Date To */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Hingga Tanggal Masuk</label>
                  <input
                    type="date"
                    value={entryDateTo ? entryDateTo.split('T')[0] : ''}
                    onChange={(e) => setEntryDateTo(e.target.value ? new Date(e.target.value).toISOString() : null)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Results info */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs text-gray-600">
              Menampilkan <span className="font-semibold">{displayTickets.length}</span> dari{' '}
              <span className="font-semibold">{activeTab === 'active' ? tickets.length : lostTickets.length}</span> tiket
            </span>
            {activeTab === 'active' && regulations.autoMarkLost.enabled && (
              <span className="text-xs text-gray-400 hidden sm:block">
                <i className="fas fa-shield-alt mr-1 text-blue-400"></i>
                {regulations.autoMarkLost.mode === 'daily'
                  ? `Batas harian: pukul ${regulations.autoMarkLost.cutoffTime}`
                  : regulations.autoMarkLost.scheduledDate
                    ? `Terjadwal: ${regulations.autoMarkLost.scheduledDate} ${regulations.autoMarkLost.scheduledTime}`
                    : 'Jadwal belum diset'}
              </span>
            )}
          </div>

          {loading && <Loading text="Memuat tiket..." />}

          {!loading && (
            <div className="bg-white rounded-xl overflow-hidden shadow-sm">
              {displayTickets.length > 0 ? (
                <div className="overflow-x-auto text-sm">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['Jenis', 'No. Tiket', 'Plat', 'Waktu Masuk', 'Durasi', 'Aksi'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-900">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayTickets.map((ticket) => (
                        <tr key={ticket.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <i className={`fas ${getVehicleIcon(ticket.vehicleType)} text-lg text-gray-500`}></i>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getVehicleBadgeColor(ticket.vehicleType)}`}>
                                {vehicleTypeMap[ticket.vehicleType]}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-blue-600 text-xs">
                                {ticket.ticketNumber}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyTicketNumber(ticket.ticketNumber)}
                                title="Salin nomor tiket"
                                aria-label="Salin nomor tiket"
                                className="shrink-0 p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                              >
                                <i
                                  className={`fas text-xs ${copiedTicketId === ticket.ticketNumber ? 'fa-check text-emerald-600' : 'fa-copy'
                                    }`}
                                />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-gray-900">{ticket.plateNumber}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-600">
                              {new Date(ticket.entryTime).toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold text-xs ${activeTab === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                              {formatDuration(ticket.entryTime)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-2">
                              {/* Primary Actions */}
                              <div className="flex gap-1.5 flex-wrap items-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTicket(ticket);
                                    setShowModal(true);
                                  }}
                                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 transition-colors"
                                >
                                  <i className="fas fa-eye mr-0.5"></i>Lihat
                                </button>
                                {activeTab === 'active' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleMarkLost(ticket)}
                                      className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200 transition-colors"
                                    >
                                      <i className="fas fa-exclamation-triangle mr-0.5"></i>Hilang
                                    </button>
                                    <button
                                      type="button"
                                      ref={expandedTicketId === ticket.id ? kebabButtonRef : undefined}
                                      onClick={() =>
                                        setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)
                                      }
                                      className="p-1.5 rounded text-slate-600 hover:bg-slate-200 transition-colors"
                                      aria-expanded={expandedTicketId === ticket.id}
                                      aria-haspopup="menu"
                                      aria-label="Menu aksi lainnya"
                                    >
                                      <i className="fas fa-ellipsis-v text-sm"></i>
                                    </button>
                                  </>
                                )}
                                {activeTab === 'lost' && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLostTicket(ticket)}
                                    disabled={deletingId === ticket.id}
                                    className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 disabled:bg-gray-200 transition-colors"
                                  >
                                    {deletingId === ticket.id ? (
                                      <i className="fas fa-spinner fa-spin mr-0.5"></i>
                                    ) : (
                                      <i className="fas fa-trash-alt mr-0.5"></i>
                                    )}
                                    Hapus
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center text-gray-400">
                  <i className="fas fa-inbox text-4xl mb-3 block"></i>
                  <p className="text-sm font-medium">Tidak ada tiket {activeTab === 'active' ? 'aktif' : 'hilang'}</p>
                  <p className="text-xs mt-1 text-gray-300">
                    {activeTab === 'active' ? 'Semua kendaraan telah keluar atau belum ada yang masuk' : 'Tidak ada tiket yang ditandai hilang'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ticket Detail Modal */}
      {showModal && selectedTicket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="bg-gradient-to-r from-slate-900 via-[#1e3a5f] to-slate-800 p-5 text-white rounded-t-2xl border-b border-white/10">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold font-display">{selectedTicket.ticketNumber}</h3>
                  <p className="text-sky-200/90 text-xs mt-0.5">{selectedTicket.plateNumber}</p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-white/80 hover:text-white text-xl leading-none">
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>
            <div className="p-5">
              {/* Entry Image Display */}
              <div className="mb-5 p-3 bg-gray-50 border-2 border-gray-200 rounded-xl">
                {entryImageUrl ? (
                  <img src={entryImageUrl} alt="Entry" className="w-full max-h-64 object-cover rounded" />
                ) : (
                  <div className="w-full h-40 flex items-center justify-center text-gray-400 text-sm">
                    <div className="text-center">
                      <i className="fas fa-image text-2xl mb-2 block"></i>
                      <p>No entry image available</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-center mb-5">
                <div className="p-3 bg-white border-2 border-gray-200 rounded-xl">
                  {selectedTicket.barcodeData || selectedTicket.ticketNumber ? (
                    <svg
                      id={`barcode-active-${selectedTicket.id}`}
                      ref={(el) => {
                        if (el) {
                          try {
                            JsBarcode(el, selectedTicket.ticketNumber || selectedTicket.barcodeData, {
                              format: 'CODE128',
                              width: 1.5,
                              height: 60,
                              displayValue: false,
                              margin: 4,
                            });
                          } catch (e) { console.error('Barcode render error', e); }
                        }
                      }}
                    ></svg>
                  ) : (
                    <div className="w-36 h-36 flex items-center justify-center text-gray-400 text-xs text-center">Barcode tidak tersedia</div>
                  )}
                  {selectedTicket.ticketNumber && (
                    <p className="text-xs font-mono font-bold text-gray-700 mt-1 tracking-wider">{selectedTicket.ticketNumber}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1 mb-5 text-sm">
                {[
                  ['Plat Nomor', selectedTicket.plateNumber],
                  ['Jenis Kendaraan', vehicleTypeMap[selectedTicket.vehicleType]],
                  ['Waktu Masuk', new Date(selectedTicket.entryTime).toLocaleString('id-ID')],
                  ['Durasi', formatDuration(selectedTicket.entryTime)],
                ].map(([label, value], i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-semibold text-gray-900 text-right">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-center">
                {activeTab === 'lost' && (
                  <button onClick={() => { setShowModal(false); handleDeleteLostTicket(selectedTicket); }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                    <i className="fas fa-trash-alt"></i>Hapus
                  </button>
                )}
                <button onClick={() => setShowModal(false)}
                  className="flex items-center justify-center gap-1.5 px-32 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                  <i className="fas fa-times"></i>Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => !deletingAll && e.target === e.currentTarget && setShowDeleteAllModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-red-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <i className="fas fa-exclamation-triangle text-lg"></i>
                </div>
                <div>
                  <h3 className="font-bold text-lg">Hapus Semua Tiket Hilang</h3>
                  <p className="text-red-100 text-xs">Tindakan ini tidak dapat dibatalkan</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-sm mb-4">
                Anda akan menghapus <strong className="text-red-600">{lostTickets.length} tiket hilang</strong> secara permanen dari sistem.
              </p>
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-red-700 font-medium"><i className="fas fa-ticket mr-1.5"></i>Total tiket akan dihapus</span>
                  <span className="font-bold text-red-700">{lostTickets.length}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteAllModal(false)} disabled={deletingAll}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
                  Batal
                </button>
                <button onClick={handleDeleteAllLost} disabled={deletingAll}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors flex items-center justify-center gap-2">
                  {deletingAll ? <><i className="fas fa-spinner fa-spin"></i>Menghapus…</> : <><i className="fas fa-trash-alt"></i>Ya, Hapus Semua</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {openKebabTicket &&
        kebabMenuPosition &&
        createPortal(
          <div
            ref={kebabMenuPanelRef}
            className="fixed z-[100] min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            style={{
              top: kebabMenuPosition.top,
              left: kebabMenuPosition.left,
              width: KEBAB_MENU_WIDTH_PX,
            }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                handleDownloadTicketImage(openKebabTicket);
                setExpandedTicketId(null);
              }}
              disabled={downloadingId === openKebabTicket.id}
              className="w-full px-3 py-2 text-left text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:text-gray-400 disabled:hover:bg-transparent flex items-center gap-2"
            >
              {downloadingId === openKebabTicket.id ? (
                <i className="fas fa-spinner fa-spin w-4 text-center"></i>
              ) : (
                <i className="fas fa-download w-4 text-center"></i>
              )}
              Download Tiket
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                handleDirectToExit(openKebabTicket);
                setExpandedTicketId(null);
              }}
              className="w-full px-3 py-2 text-left text-xs font-medium text-teal-700 hover:bg-teal-50 flex items-center gap-2"
            >
              <i className="fas fa-arrow-right w-4 text-center"></i>
              Arahkan ke Exit
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ActiveTickets;