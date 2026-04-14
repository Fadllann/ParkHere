import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import BrandWordmark from './BrandWordmark';

const Navbar = ({ onMenuClick, showMenuButton = false }) => {
    const { isAuthenticated, user, logout } = useAuth();
    const [showUserMenu, setShowUserMenu] = useState(false);

    return (
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20 shadow-sm shadow-slate-900/5">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-4">
                        {showMenuButton && (
                            <button
                                type="button"
                                onClick={onMenuClick}
                                className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600"
                            >
                                <i className="fas fa-bars" aria-hidden />
                            </button>
                        )}

                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 to-brand-navyMid flex items-center justify-center shadow-lg shadow-slate-900/25 ring-1 ring-amber-400/40">
                                <span className="text-white font-display font-extrabold text-sm tracking-tight">P</span>
                            </div>
                            <div className="hidden sm:block font-display">
                                <BrandWordmark size="md" variant="dark" />
                            </div>
                        </Link>
                    </div>

                    <div className="flex items-center gap-3">
                        {!isAuthenticated ? (
                            <>
                                <Link
                                    to="/entry"
                                    className="hidden sm:flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
                                >
                                    <i className="fas fa-arrow-right-to-bracket text-slate-400" aria-hidden />
                                    <span>Masuk Parkir</span>
                                </Link>
                                <Link
                                    to="/exit"
                                    className="hidden sm:flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
                                >
                                    <i className="fas fa-arrow-right-from-bracket text-slate-400" aria-hidden />
                                    <span>Keluar Parkir</span>
                                </Link>
                                <Link to="/" className="btn-primary flex items-center gap-2 text-sm">
                                    <i className="fas fa-user" aria-hidden />
                                    <span>Login</span>
                                </Link>
                            </>
                        ) : (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowUserMenu(!showUserMenu)}
                                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-800 to-brand-navyMid flex items-center justify-center ring-2 ring-amber-400/30">
                                        <span className="text-white text-sm font-semibold">
                                            {user?.username?.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <span className="hidden sm:inline text-slate-700 font-medium text-sm">
                                        {user?.username}
                                    </span>
                                    <i className="fas fa-chevron-down text-slate-400 text-xs" aria-hidden />
                                </button>

                                {showUserMenu && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-10"
                                            onClick={() => setShowUserMenu(false)}
                                            aria-hidden
                                        />
                                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200/80 py-2 animate-fade-in z-20 ph-card">
                                            <Link
                                                to="/admin"
                                                className="flex items-center gap-3 px-4 py-2 text-slate-700 hover:bg-slate-50 text-sm"
                                                onClick={() => setShowUserMenu(false)}
                                            >
                                                <i className="fas fa-chart-line w-5 text-slate-400" aria-hidden />
                                                Dashboard
                                            </Link>
                                            <hr className="my-2 border-slate-100" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowUserMenu(false);
                                                    logout();
                                                }}
                                                className="flex items-center gap-3 w-full px-4 py-2 text-red-600 hover:bg-red-50 text-sm"
                                            >
                                                <i className="fas fa-sign-out-alt w-5" aria-hidden />
                                                Keluar
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Navbar;
