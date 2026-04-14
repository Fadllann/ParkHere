/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    navy: '#0f172a',
                    navyMid: '#1e3a5f',
                    sky: '#93c5fd',
                    skySoft: 'rgba(180, 210, 255, 0.85)',
                    amber: '#f59e0b',
                    amberLight: '#fbbf24',
                    page: '#e8eef7',
                    page2: '#f1f5f9',
                },
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                },
                success: {
                    500: '#10b981',
                    600: '#059669'
                },
                warning: {
                    500: '#f59e0b',
                    600: '#d97706'
                },
                danger: {
                    500: '#ef4444',
                    600: '#dc2626'
                }
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-out',
                'slide-in': 'slideIn 0.3s ease-out',
                'pulse-slow': 'pulse 3s infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideIn: {
                    '0%': { transform: 'translateY(-10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                }
            }
        },
    },
    plugins: [],
}
