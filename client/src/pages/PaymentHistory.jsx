import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/common/Sidebar';
import Loading from '../components/common/Loading';
import { transactionService, paymentService } from '../services/api';
import { showError, showSuccess, showConfirm } from '../utils/alerts';
import { useAuth } from '../context/AuthContext';
import { getCacheData, invalidateCache } from '../utils/apiCache';

const TYPE_FILTER = [
    { value: 'all', label: 'Semua' },
    { value: 'income', label: 'Pendapatan' },
    { value: 'outcome', label: 'Pengeluaran' }
];

const SOURCE_LABEL = {
    payment: 'Pembayaran',
    expense: 'Pengeluaran',
    refund: 'Refund',
    manual: 'Manual'
};

const emptyForm = {
    type: 'income',
    amount: '',
    description: '',
    source: 'manual',
    referenceId: ''
};

// Format number to Rp. format
const formatRupiah = (num) => {
    const n = parseInt(num, 10) || 0;
    if (n === 0) return '';
    return `Rp. ${n.toLocaleString('id-ID')}`;
};

const PaymentHistory = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [typeFilter, setTypeFilter] = useState('all');
    const [showImageModal, setShowImageModal] = useState(false);
    const [selectedImageUrl, setSelectedImageUrl] = useState(null);

    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [form, setForm] = useState(emptyForm);

    const [showRefundModal, setShowRefundModal] = useState(false);
    const [refundRow, setRefundRow] = useState(null);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundDescription, setRefundDescription] = useState('');

    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const cacheKey = `transactions_${page}_${typeFilter}`;
            const { data } = await getCacheData(cacheKey, async () => {
                const res = await transactionService.list({ 
                    page, 
                    limit: 20, 
                    type: typeFilter !== 'all' ? typeFilter : undefined 
                });
                return res.data.data;
            });
            
            setTransactions(data.transactions || []);
            setSummary(data.summary || null);
            setTotalPages(data.pagination?.totalPages || 1);
        } catch (err) {
            console.error('Error fetching transactions:', err);
            showError('Gagal memuat arus kas');
        } finally {
            setLoading(false);
        }
    }, [page, typeFilter]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    useEffect(() => {
        setPage(1);
    }, [typeFilter]);

    const handleViewExitImage = (imageUrl) => {
        setSelectedImageUrl(imageUrl);
        setShowImageModal(true);
    };

    const openAdd = () => {
        setForm(emptyForm);
        setShowAddModal(true);
    };

    const openEdit = (row) => {
        if (row.paymentId != null || row.source === 'payment') {
            showError('Transaksi dari pembayaran tidak dapat diubah');
            return;
        }
        setEditingRow(row);
        setForm({
            type: row.type,
            amount: String(row.amount),
            description: row.description || '',
            source: row.source,
            referenceId: row.referenceId || ''
        });
        setShowEditModal(true);
    };

    const openRefund = (row) => {
        const pid = row.paymentId || row.payment?.id;
        if (!pid) {
            showError('Tidak ada pembayaran terkait');
            return;
        }
        const max = parseFloat(row.payment?.amount ?? row.amount);
        setRefundRow({ ...row, _paymentId: pid, _max: max });
        setRefundAmount(String(max));
        setRefundDescription('');
        setShowRefundModal(true);
    };

    const submitCreate = async (e) => {
        e.preventDefault();
        try {
            await transactionService.create({
                type: form.type,
                amount: parseFloat(form.amount),
                source: form.source,
                description: form.description || undefined,
                referenceId: form.referenceId || undefined
            });
            showSuccess('Transaksi ditambahkan');
            setShowAddModal(false);
            invalidateCache(`transactions_${page}_${typeFilter}`);
            fetchTransactions();
        } catch (err) {
            showError(err.response?.data?.message || 'Gagal menambah transaksi');
        }
    };

    const submitEdit = async (e) => {
        e.preventDefault();
        if (!editingRow) return;
        try {
            const payload = {
                amount: parseFloat(form.amount),
                description: form.description,
                referenceId: form.referenceId || null
            };
            if (editingRow.source === 'manual' || editingRow.source === 'expense' || editingRow.source === 'refund') {
                payload.type = form.type;
            }
            await transactionService.update(editingRow.id, payload);
            showSuccess('Transaksi diperbarui');
            setShowEditModal(false);
            setEditingRow(null);
            invalidateCache(`transactions_${page}_${typeFilter}`);
            fetchTransactions();
        } catch (err) {
            showError(err.response?.data?.message || 'Gagal memperbarui');
        }
    };

    const handleDelete = async (row) => {
        if (row.paymentId != null || row.source === 'payment') {
            showError('Tidak dapat menghapus transaksi dari pembayaran');
            return;
        }
        const ok = await showConfirm('Hapus transaksi ini?', 'Konfirmasi');
        if (!ok.isConfirmed) return;
        try {
            await transactionService.delete(row.id);
            showSuccess('Transaksi dihapus');
            invalidateCache(`transactions_${page}_${typeFilter}`);
            fetchTransactions();
        } catch (err) {
            showError(err.response?.data?.message || 'Gagal menghapus');
        }
    };

    const submitRefund = async (e) => {
        e.preventDefault();
        if (!refundRow) return;
        const amt = parseFloat(refundAmount);
        if (amt <= 0 || amt > refundRow._max) {
            showError(`Jumlah refund harus antara 0 dan ${refundRow._max}`);
            return;
        }
        try {
            await paymentService.refund(refundRow._paymentId, {
                amount: amt,
                description: refundDescription || undefined
            });
            showSuccess('Refund dicatat');
            setShowRefundModal(false);
            setRefundRow(null);
            invalidateCache(`transactions_${page}_${typeFilter}`);
            fetchTransactions();
        } catch (err) {
            showError(err.response?.data?.message || 'Gagal refund');
        }
    };

    const canRefund = (row) =>
        isAdmin && row.type === 'income' && row.source === 'payment' && (row.paymentId || row.payment?.id);

    const exitPathForRow = (row) => {
        const path = row.payment?.ticket?.exitImagePath;
        if (!path) return null;
        return path.startsWith('/') ? path : `/${path}`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-[#e8eef7] to-slate-100">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="lg:ml-[260px]">
                <header className="bg-white/95 backdrop-blur-sm border-b border-slate-200/80 sticky top-0 z-10 shadow-sm shadow-slate-900/5">
                    <div className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setSidebarOpen(true)}
                                className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100"
                            >
                                <i className="fas fa-bars text-gray-600 text-sm" />
                            </button>
                            <h1 className="text-lg font-bold text-slate-900 font-display tracking-tight">
                                Arus Kas
                            </h1>
                        </div>
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={openAdd}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                            >
                                <i className="fas fa-plus" />
                                Tambah transaksi
                            </button>
                        )}
                    </div>
                </header>

                <div className="p-5">
                    <p className="text-xs text-slate-500 mb-4">
                        Ringkasan di bawah ini adalah total seluruh transaksi. Tabel dapat difilter tanpa mengubah angka
                        ringkasan.
                    </p>

                    {summary && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                                        <i className="fas fa-arrow-down text-emerald-700" />
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-xs">Total pendapatan</p>
                                        <p className="text-lg font-bold text-gray-900 mt-0.5">
                                            {summary.formattedTotalIncome}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                                        <i className="fas fa-arrow-up text-rose-700" />
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-xs">Total pengeluaran</p>
                                        <p className="text-lg font-bold text-gray-900 mt-0.5">
                                            {summary.formattedTotalOutcome}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200/60">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
                                        <i className="fas fa-scale-balanced text-sky-700" />
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-xs">Saldo bersih</p>
                                        <p className="text-lg font-bold text-gray-900 mt-0.5">
                                            {summary.formattedNetBalance}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        {TYPE_FILTER.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setTypeFilter(opt.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                    typeFilter === opt.value
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <Loading text="Memuat arus kas..." />
                    ) : (
                        <>
                            <div className="bg-white rounded-xl overflow-hidden text-sm border border-slate-200/60 shadow-sm">
                                {transactions.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[900px]">
                                            <thead className="bg-gray-50 border-b">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900">
                                                        Tanggal
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900">
                                                        Tipe
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900">
                                                        Jumlah
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900">
                                                        Keterangan
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900">
                                                        Sumber
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900">
                                                        Ref. ID
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900">
                                                        Dibuat oleh
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900">
                                                        Aksi
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {transactions.map((row) => {
                                                    const locked = row.paymentId != null || row.source === 'payment';
                                                    const exitUrl = exitPathForRow(row);
                                                    return (
                                                        <tr key={row.id} className="border-b hover:bg-gray-50">
                                                            <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                                                {new Date(row.createdAt).toLocaleString('id-ID', {
                                                                    year: '2-digit',
                                                                    month: '2-digit',
                                                                    day: '2-digit',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <span
                                                                    className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                                                        row.type === 'income'
                                                                            ? 'bg-emerald-100 text-emerald-800'
                                                                            : 'bg-rose-100 text-rose-800'
                                                                    }`}
                                                                >
                                                                    {row.type === 'income' ? 'Pendapatan' : 'Pengeluaran'}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <span
                                                                    className={`font-bold text-xs ${
                                                                        row.type === 'income'
                                                                            ? 'text-emerald-600'
                                                                            : 'text-rose-600'
                                                                    }`}
                                                                >
                                                                    {row.formattedAmount}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-xs text-gray-700 max-w-[180px] truncate">
                                                                {row.description || '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-xs">
                                                                {SOURCE_LABEL[row.source] || row.source}
                                                            </td>
                                                            <td className="px-3 py-2 font-mono text-xs text-gray-600">
                                                                {row.referenceId || '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-xs text-gray-700">
                                                                {row.creator?.username || '—'}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {exitUrl && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                handleViewExitImage(exitUrl)
                                                                            }
                                                                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
                                                                        >
                                                                            <i className="fas fa-eye mr-0.5" />
                                                                            Foto
                                                                        </button>
                                                                    )}
                                                                    {canRefund(row) && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openRefund(row)}
                                                                            className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium hover:bg-amber-200"
                                                                        >
                                                                            Refund
                                                                        </button>
                                                                    )}
                                                                    {isAdmin && !locked && (
                                                                        <>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openEdit(row)}
                                                                                className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium hover:bg-slate-200"
                                                                            >
                                                                                Ubah
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDelete(row)}
                                                                                className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs font-medium hover:bg-red-100"
                                                                            >
                                                                                Hapus
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="p-6 text-center text-gray-500 text-sm">
                                        <i className="fas fa-inbox text-3xl mb-2 block" />
                                        <p>Belum ada transaksi</p>
                                    </div>
                                )}
                            </div>

                            {totalPages > 1 && (
                                <div className="flex justify-center gap-1.5 mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-3 py-1.5 text-xs rounded bg-white border disabled:opacity-50"
                                    >
                                        <i className="fas fa-chevron-left" />
                                    </button>
                                    <span className="px-3 py-1.5 text-xs">
                                        {page} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="px-3 py-1.5 text-xs rounded bg-white border disabled:opacity-50"
                                    >
                                        <i className="fas fa-chevron-right" />
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Add modal */}
            {showAddModal && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
                >
                    <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Tambah transaksi</h3>
                        <form onSubmit={submitCreate} className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Tipe</label>
                                <select
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={form.type}
                                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                                >
                                    <option value="income">Pendapatan</option>
                                    <option value="outcome">Pengeluaran</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Sumber</label>
                                <select
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={form.source}
                                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                                >
                                    {form.type === 'income' ? (
                                        <>
                                            <option value="manual">Manual</option>
                                            <option value="payment">Pembayaran</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="expense">Pengeluaran</option>
                                            <option value="refund">Refund</option>
                                            <option value="manual">Manual</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Jumlah (IDR)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    required
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={form.amount}
                                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                />
                                {form.amount && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        {formatRupiah(form.amount)}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                                <textarea
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Ref. ID (opsional)</label>
                                <input
                                    type="text"
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={form.referenceId}
                                    onChange={(e) => setForm({ ...form, referenceId: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 text-sm rounded-lg border"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white"
                                >
                                    Simpan
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit modal */}
            {showEditModal && editingRow && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={(e) => e.target === e.currentTarget && setShowEditModal(false)}
                >
                    <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Ubah transaksi</h3>
                        <form onSubmit={submitEdit} className="space-y-3">
                            {(editingRow.source === 'manual' ||
                                editingRow.source === 'expense' ||
                                editingRow.source === 'refund') && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Tipe</label>
                                    <select
                                        className="w-full border rounded-lg px-3 py-2 text-sm"
                                        value={form.type}
                                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                                    >
                                        <option value="income">Pendapatan</option>
                                        <option value="outcome">Pengeluaran</option>
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Jumlah (IDR)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    required
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={form.amount}
                                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                                <input
                                    type="text"
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Ref. ID</label>
                                <input
                                    type="text"
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={form.referenceId}
                                    onChange={(e) => setForm({ ...form, referenceId: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setEditingRow(null);
                                    }}
                                    className="px-4 py-2 text-sm rounded-lg border"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white"
                                >
                                    Simpan
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Refund modal */}
            {showRefundModal && refundRow && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={(e) => e.target === e.currentTarget && setShowRefundModal(false)}
                >
                    <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Catat refund</h3>
                        <p className="text-xs text-gray-500 mb-4">
                            Maks. {refundRow._max.toLocaleString('id-ID')} IDR (dari pembayaran #{refundRow._paymentId})
                        </p>
                        <form onSubmit={submitRefund} className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Jumlah refund</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    required
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={refundAmount}
                                    onChange={(e) => setRefundAmount(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                                <input
                                    type="text"
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={refundDescription}
                                    onChange={(e) => setRefundDescription(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowRefundModal(false)}
                                    className="px-4 py-2 text-sm rounded-lg border"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white"
                                >
                                    Proses refund
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showImageModal && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={(e) => e.target === e.currentTarget && setShowImageModal(false)}
                >
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="bg-gradient-to-r from-slate-900 via-[#1e3a5f] to-slate-800 p-5 text-white rounded-t-2xl border-b border-white/10 flex justify-between items-center">
                            <h3 className="text-lg font-bold font-display">Foto Exit</h3>
                            <button
                                type="button"
                                onClick={() => setShowImageModal(false)}
                                className="text-white/80 hover:text-white text-xl leading-none"
                            >
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <div className="p-5">
                            {selectedImageUrl && selectedImageUrl !== 'null' ? (
                                <img
                                    src={selectedImageUrl}
                                    alt="Exit"
                                    className="w-full max-h-96 object-cover rounded-lg"
                                />
                            ) : (
                                <div className="w-full h-64 flex items-center justify-center bg-gray-100 rounded-lg text-gray-400">
                                    <div className="text-center">
                                        <i className="fas fa-image text-3xl mb-2 block" />
                                        <p className="text-sm">Tidak ada foto</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-center mt-4 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowImageModal(false)}
                                    className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                    <i className="fas fa-times" />
                                    Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentHistory;
