import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/api';
import { showError } from '../../utils/alerts';
import Loading from '../common/Loading';

const PAGE_SIZE = 50;

const ACTION_FILTER_OPTIONS = [
  { value: 'UPDATE_RATE', label: 'Update tarif' },
  { value: 'UPDATE_SETTINGS', label: 'Update pengaturan' },
  { value: 'UPDATE_USER', label: 'Update pengguna' },
  { value: 'PAYMENT_PROCESSED', label: 'Pembayaran diproses' },
  { value: 'LOST_TICKET_PAYMENT', label: 'Pembayaran tiket hilang' },
  { value: 'LOGIN', label: 'Masuk' },
  { value: 'LOGOUT', label: 'Keluar' },
  { value: 'CREATE_USER', label: 'Buat pengguna' },
  { value: 'UPDATE_PROFILE', label: 'Update profil' },
  { value: 'TICKET_CREATED', label: 'Tiket dibuat' },
  { value: 'TICKET_EXIT', label: 'Tiket keluar' },
  { value: 'TICKET_REPRINTED', label: 'Tiket dicetak ulang' },
  { value: 'TICKET_MARKED_LOST', label: 'Tiket ditandai hilang' },
  { value: 'TICKET_DELETED', label: 'Tiket dihapus' },
  { value: 'CREATE_TRANSACTION', label: 'Buat transaksi keuangan' },
  { value: 'UPDATE_TRANSACTION', label: 'Update transaksi keuangan' },
  { value: 'DELETE_TRANSACTION', label: 'Hapus transaksi keuangan' },
  { value: 'PAYMENT_INCOME', label: 'Pendapatan pembayaran (ledger)' },
  { value: 'REFUND_OUTCOME', label: 'Pengembalian dana (ledger)' },
];

function formatEntity(log) {
  const { entityType, entityId } = log;
  if (!entityType && (entityId == null || entityId === '')) return '—';
  if (entityType && entityId != null && entityId !== '') return `${entityType} #${entityId}`;
  if (entityType) return entityType;
  return `#${entityId}`;
}

function formatLogDetails(details) {
  if (details == null) return '—';
  if (typeof details === 'string') {
    const t = details.trim();
    return t.length > 80 ? `${t.slice(0, 80)}…` : t || '—';
  }
  try {
    const s = JSON.stringify(details);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  } catch {
    return '—';
  }
}

const ActivityLogsModal = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    action: '',
    dateFrom: '',
    dateTo: '',
  });

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
      };
      if (filters.action) params.action = filters.action;
      if (filters.dateFrom) params.fromDate = filters.dateFrom;
      if (filters.dateTo) params.toDate = filters.dateTo;

      const res = await adminService.getActivityLogs(params);
      const payload = res.data?.data;
      const list = Array.isArray(payload?.logs) ? payload.logs : [];
      const totalCount = payload?.pagination?.total ?? 0;
      setLogs(list);
      setTotal(totalCount);
    } catch {
      showError('Gagal memuat log aktivitas');
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
      // Disable body scroll
      document.body.style.overflow = 'hidden';
    }
    return () => {
      // Restore body scroll
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, loadLogs]);

  if (!isOpen) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Log Aktivitas</h2>
            <p className="text-xs text-gray-500 mt-1">Total: {total} aktivitas</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-1"
            aria-label="Tutup"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Jenis Aktivitas</label>
            <select
              value={filters.action}
              onChange={(e) => {
                setFilters({ ...filters, action: e.target.value });
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Aktivitas</option>
              {ACTION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => {
                setFilters({ ...filters, dateFrom: e.target.value });
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => {
                setFilters({ ...filters, dateTo: e.target.value });
                setPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="p-6">
              <Loading text="Memuat..." />
            </div>
          ) : (
            <div className="overflow-x-auto text-sm">
              <table className="w-full">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    {['Waktu', 'Aktivitas', 'Pengguna', 'Entitas', 'Detail'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-xs">
                        Tidak ada log aktivitas
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString('id-ID') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-blue-600">{log.action}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {log.user?.username || 'System'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[10rem] truncate" title={formatEntity(log)}>
                          {formatEntity(log)}
                        </td>
                        <td
                          className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate"
                          title={formatLogDetails(log.details)}
                        >
                          {formatLogDetails(log.details)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between shrink-0">
            <div className="text-xs text-gray-600">
              Halaman {page} dari {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLogsModal;
