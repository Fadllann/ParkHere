import { Link } from 'react-router-dom';
import BrandWordmark from './BrandWordmark';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-[#e8eef7] to-slate-200 flex flex-col items-center justify-center px-6">
            <div className="ph-card max-w-md w-full p-10 text-center rounded-2xl">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-900 to-[#1e3a5f] text-amber-300 mb-6 ring-2 ring-amber-400/25">
                    <i className="fas fa-road text-xl" aria-hidden />
                </div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-2">404</p>
                <h1 className="text-2xl font-bold text-slate-900 font-display mb-2">
                    Halaman tidak ditemukan
                </h1>
                <p className="text-slate-600 text-sm mb-8">
                    URL yang Anda buka tidak ada atau telah dipindahkan.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        to="/"
                        className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold"
                    >
                        <i className="fas fa-home" aria-hidden />
                        Beranda
                    </Link>
                    <Link
                        to="/admin"
                        className="btn-outline-amber inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold"
                    >
                        <i className="fas fa-chart-line" aria-hidden />
                        Dashboard
                    </Link>
                </div>
                <p className="mt-8 text-xs text-slate-400">
                    <BrandWordmark size="sm" variant="dark" />
                </p>
            </div>
        </div>
    );
}
