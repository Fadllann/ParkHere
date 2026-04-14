import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrandWordmark from './BrandWordmark';

const Sidebar = ({ isOpen, onClose }) => {
    const location = useLocation();
    const { user, logout } = useAuth();

    const menuItems = [
        {
            title: 'Dashboard',
            icon: 'fa-solid fa-house',
            path: '/admin',
            roles: ['admin', 'operator']
        },
        {
            title: 'Statistik',
            icon: 'fa-chart-line',
            path: '/admin/statistics',
            roles: ['admin', 'operator']
        },
        {
            title: 'Tiket Aktif',
            icon: 'fa-ticket',
            path: '/admin/tickets',
            roles: ['admin', 'operator']
        },
        {
            title: 'Arus Kas',
            icon: 'fa-money-bill-wave',
            path: '/admin/payments',
            roles: ['admin', 'operator']
        },
        {
            title: 'Pengaturan',
            icon: 'fa-cog',
            path: '/admin/settings',
            roles: ['admin']
        }
    ];

    const quickLinks = [
        { title: 'Buat Tiket Manual', icon: 'fa-arrow-right-to-bracket', path: '/entry' },
        { title: 'Keluar & Bayar', icon: 'fa-arrow-right-from-bracket', path: '/exit' }
    ];

    const filteredMenu = menuItems.filter(
        item => item.roles.includes(user?.role)
    );

    const isActive = (path) => location.pathname === path;

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={onClose}
                    aria-hidden
                />
            )}

            <aside
                className={`sidebar transform ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    } lg:translate-x-0`}
            >
                <div className="p-6 border-b border-white/10">
                    <Link to="/" className="flex items-center gap-3" onClick={() => window.innerWidth < 1024 && onClose?.()}>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-brand-navyMid flex items-center justify-center ring-1 ring-amber-400/35 shrink-0">
                            <span className="text-white font-display font-extrabold text-sm">P</span>
                        </div>
                        <div className="min-w-0 font-display">
                            <BrandWordmark size="md" variant="light" />
                            <p className="text-white/50 text-xs mt-0.5">Kelola Parkir</p>
                        </div>
                    </Link>
                </div>

                <div className="px-3 mt-6">
                    <p className="text-white/40 text-xs font-semibold uppercase tracking-wider px-3 mb-2">
                        Aksi Cepat
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {quickLinks.map((link) => (
                            <Link
                                key={link.path}
                                to={link.path}
                                className="flex flex-col items-center gap-1 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-amber-400/20"
                            >
                                <i className={`fas ${link.icon} text-amber-400/90`} aria-hidden />
                                <span className="text-white/70 text-xs text-center leading-tight">{link.title}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                <nav className="mt-6 flex-1 pb-4">
                    <p className="text-white/40 text-xs font-semibold uppercase tracking-wider px-6 mb-2">
                        Menu
                    </p>
                    {filteredMenu.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
                        >
                            <i className={`fas ${item.icon} w-5 text-center opacity-90`} aria-hidden />
                            <span>{item.title}</span>
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/10 mt-auto">
                    <button
                        type="button"
                        onClick={logout}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-300 hover:bg-red-500/10 transition-colors text-sm font-medium"
                    >
                        <i className="fas fa-sign-out-alt w-5 text-center" aria-hidden />
                        <span>Keluar</span>
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
