import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import Login from './pages/Login';
import Entry from './pages/Entry';
import AutoEntry from './pages/AutoEntry';
import Exit from './pages/Exit';
import AdminDashboard from './pages/AdminDashboard';
import Statistics from './pages/Statistics';
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

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
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
                        path="/admin/statistics"
                        element={
                            <ProtectedRoute allowedRoles={['admin', 'operator']}>
                                <Statistics />
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