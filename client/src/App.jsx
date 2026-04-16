import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { adminService } from './services/api';

// Pages
import Login from './pages/Login';
import Entry from './pages/Entry';
import AutoEntry from './pages/AutoEntry';
import Exit from './pages/Exit';
import AdminDashboard from './pages/AdminDashboard';
import ActiveTickets from './pages/ActiveTickets';
import PaymentHistory from './pages/PaymentHistory';
import Settings from './pages/Settings';

// Components
import NotFound from './components/common/NotFound';
import Loading from './components/common/Loading';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
    const { isAuthenticated, loading, user } = useAuth();

    if (loading) {
        return <Loading fullScreen />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    // Check if user has required role (if roles are specified)
    if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
        return <Navigate to="/" replace />;
    }

    return children;
};

// Public Route (redirect if authenticated)
const PublicRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <Loading fullScreen />;
    }

    if (isAuthenticated) {
        return <Navigate to="/admin" replace />;
    }

    return children;
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

const GlobalEmergencyModal = () => {
    const { isAuthenticated, loading, user } = useAuth();
    const location = useLocation();
    const [alerts, setAlerts] = useState([]);
    const [visible, setVisible] = useState(false);
    const [dismissedIds, setDismissedIds] = useState(() => readDismissedEmergencyIds());

    const canReceiveAlerts = useMemo(
        () => isAuthenticated && ['admin', 'operator'].includes(user?.role),
        [isAuthenticated, user?.role]
    );

    useEffect(() => {
        if (!canReceiveAlerts || loading) return undefined;

        let mounted = true;
        const loadEmergency = async () => {
            try {
                const res = await adminService.getDashboard();
                const emergencies = res.data?.success ? (res.data?.data?.entryEmergencies || []) : [];
                const active = emergencies.filter((item) => !dismissedIds.has(item.id));
                if (!mounted) return;
                setAlerts(active);
                if (active.length > 0 && location.pathname !== '/auto-entry') {
                    setVisible(true);
                }
            } catch {
                // no-op: don't block UI if polling fails
            }
        };

        loadEmergency();
        const timer = setInterval(loadEmergency, 25000);
        return () => {
            mounted = false;
            clearInterval(timer);
        };
    }, [canReceiveAlerts, dismissedIds, loading, location.pathname]);

    if (!canReceiveAlerts || alerts.length === 0 || !visible) return null;

    const markAsDone = () => {
        const next = new Set(dismissedIds);
        alerts.forEach((item) => next.add(item.id));
        setDismissedIds(next);
        writeDismissedEmergencyIds(next);
        setVisible(false);
    };

    return (
        <div
            className="fixed inset-0 z-[70] bg-black/45 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setVisible(false)}
        >
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-rose-100">
                <div className="bg-gradient-to-r from-rose-600 to-red-600 px-5 py-4 text-white">
                    <div className="flex items-center gap-3">
                        <i className="fas fa-bell text-lg"></i>
                        <div>
                            <p className="font-bold">Darurat Gerbang Masuk</p>
                            <p className="text-xs text-rose-100">{alerts.length} notifikasi baru</p>
                        </div>
                    </div>
                </div>
                <div className="px-5 py-4 text-sm text-slate-700 space-y-2">
                    <p>Ada permintaan bantuan dari gerbang masuk. Silakan tindak lanjuti segera.</p>
                    <p className="text-xs text-slate-500">
                        Terbaru: {alerts[0]?.createdAt ? new Date(alerts[0].createdAt).toLocaleString('id-ID') : '-'}
                    </p>
                </div>
                <div className="px-5 pb-5 flex gap-2">
                    <Link
                        to="/auto-entry"
                        onClick={() => setVisible(false)}
                        className="flex-1 text-center px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium"
                    >
                        Buka Gerbang Masuk
                    </Link>
                    <button
                        type="button"
                        onClick={markAsDone}
                        className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors text-sm font-medium"
                    >
                        Mark as Done
                    </button>
                </div>
            </div>
        </div>
    );
};

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <GlobalEmergencyModal />
                <Routes>
                    {/* Login is the landing page */}
                    <Route
                        path="/"
                        element={
                            <PublicRoute>
                                <Login />
                            </PublicRoute>
                        }
                    />
                    <Route
                        path="/auto-entry"
                        element={<AutoEntry />}
                    />
                    <Route
                        path="/entry"
                        element={
                            <ProtectedRoute>
                                <Entry />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/exit"
                        element={
                            <ProtectedRoute>
                                <Exit />
                            </ProtectedRoute>
                        }
                    />

                    {/* Protected Admin Routes */}
                    <Route
                        path="/admin"
                        element={
                            <ProtectedRoute allowedRoles={['admin', 'operator']}>
                                <AdminDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/dashboard"
                        element={
                            <ProtectedRoute allowedRoles={['admin', 'operator']}>
                                <AdminDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/tickets"
                        element={
                            <ProtectedRoute allowedRoles={['admin', 'operator']}>
                                <ActiveTickets />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/payment-history"
                        element={
                            <ProtectedRoute allowedRoles={['admin', 'operator']}>
                                <PaymentHistory />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/payments"
                        element={
                            <ProtectedRoute allowedRoles={['admin', 'operator']}>
                                <PaymentHistory />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/settings"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <Settings />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/settings"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <Settings />
                            </ProtectedRoute>
                        }
                    />

                    <Route path="*" element={<NotFound />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;