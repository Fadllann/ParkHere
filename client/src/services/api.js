import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000,
    maxRedirects: 0
});

// Request interceptor add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('token');

            // Only redirect if not already on login page
            if (window.location.pathname !== '/login') {
                window.location.href = '/';
            }
        }
        return Promise.reject(error);
    }
);

export default api;

// API service functions
export const ticketService = {
    create: (data) => api.post('/tickets', data),
    getActive: () => api.get('/tickets/active'),
    getMyTickets: () => api.get('/tickets/my-tickets'),
    get: (identifier) => api.get(`/tickets/${identifier}`),
    search: (params) => api.get('/tickets/search', { params }),
    print: (id) => api.post(`/tickets/${id}/print`),
    markLost: (id, data) => api.put(`/tickets/${id}/lost`, data),
    delete: (id) => api.delete(`/tickets/${id}`),
    cancel: (id) => api.delete(`/tickets/${id}`)
};

/** Public — Gerbang Masuk */
export const entryService = {
    postEmergency: () => api.post('/entry/emergency')
};

export const paymentService = {
    calculate: (params) => {
        if (params?.barcodeData != null && String(params.barcodeData).length > 0) {
            return api.post('/payments/calculate', { barcodeData: params.barcodeData });
        }
        return api.get('/payments/calculate', { params });
    },
    process: (data) => api.post('/payments', data),
    get: (identifier) => api.get(`/payments/${identifier}`),
    getHistory: (params) => api.get('/payments/history', { params }),
    refund: (paymentId, data) => api.post(`/payments/${paymentId}/refund`, data)
};

export const transactionService = {
    list: (params) => api.get('/transactions', { params }),
    create: (data) => api.post('/transactions', data),
    update: (id, data) => api.put(`/transactions/${id}`, data),
    delete: (id) => api.delete(`/transactions/${id}`)
};

export const adminService = {
    getDashboard: () => api.get('/admin/dashboard'),
    getUsers: () => api.get('/admin/users'),
    updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
    deleteUser: (id) => api.delete(`/admin/users/${id}`),
    getRates: () => api.get('/admin/rates'),
    updateRate: (vehicleType, data) => api.put(`/admin/rates/${vehicleType}`, data),
    getSettings: () => api.get('/admin/settings'),
    updateSettings: (data) => api.put('/admin/settings', data),
    getActivityLogs: (params) => api.get('/admin/activity-logs', { params })
};

export const authService = {
    login: (data) => api.post('/auth/login', data),
    register: (data) => api.post('/auth/register', data),
    getProfile: () => api.get('/auth/profile'),
    updateProfile: (data) => api.put('/auth/profile', data),
    verify: () => api.get('/auth/verify')
};

export const backupService = {
    getBackupStatus: () => api.get('/admin/backup/status'),
    triggerBackup: () => api.post('/admin/backup', {}, { responseType: 'blob' }),
    importDatabase: (formData) => api.post('/admin/backup/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    configureAutoBackup: (data) => api.post('/admin/backup/auto', data)
};
