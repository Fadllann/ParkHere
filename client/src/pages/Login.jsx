import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showError } from '../utils/alerts';
import BrandWordmark from '../components/common/BrandWordmark';

const Login = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [formData, setFormData] = useState({ username: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.username || !formData.password) {
            showError('Masukkan Username dan Password');
            return;
        }

        setLoading(true);

        try {
            const result = await login(formData.username, formData.password);

            if (result.success) {
                navigate('/admin');
            } else {
                showError(result.message || 'Login gagal');
            }
        } catch (error) {
            showError('Terjadi kesalahan. Silakan coba lagi.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@300;400;500;600&display=swap');

                /* Reset & Base*/
                .login-page {
                    min-height: 100vh;
                    display: flex;
                    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
                }

                /* LEFT BRAND PANEL*/
                .login-brand-panel {
                    display: none;
                    width: 58%;
                    position: relative;
                    overflow: hidden;
                    flex-direction: column;
                    align-items: flex-start;
                    justify-content: flex-end;
                    padding: 3.5rem;
                    background: #060d1a;
                }

                /* Layered sky gradient */
                .login-brand-panel::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background:
                        radial-gradient(ellipse 80% 60% at 20% 10%, rgba(0, 100, 255, 0.18) 0%, transparent 60%),
                        radial-gradient(ellipse 60% 80% at 80% 90%, rgba(30, 58, 95, 0.35) 0%, transparent 55%),
                        radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0, 200, 255, 0.06) 0%, transparent 70%),
                        linear-gradient(175deg, #0a1628 0%, #060d1a 45%, #0d0718 100%);
                    z-index: 0;
                }

                /* Ground / tarmac strip at bottom */
                .tarmac {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 38%;
                    background: linear-gradient(180deg, transparent 0%, #090f1c 30%, #060c17 100%);
                    z-index: 1;
                }

                /* Parking grid lines on tarmac */
                .tarmac::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background-image:
                        linear-gradient(90deg, rgba(255,220,50,0.18) 2px, transparent 2px),
                        linear-gradient(rgba(255,220,50,0.05) 1px, transparent 1px);
                    background-size: 90px 60px;
                    mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.9) 100%);
                }

                /* Perspective road lines */
                .road-lines {
                    position: absolute;
                    bottom: 0;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 60px;
                    height: 38%;
                    z-index: 2;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 18px;
                    padding-bottom: 1.5rem;
                }

                .road-dash {
                    width: 6px;
                    border-radius: 3px;
                    background: rgba(255, 220, 50, 0.6);
                    animation: dashFade 1.6s ease-in-out infinite;
                }
                .road-dash:nth-child(1) { height: 28px; animation-delay: 0s; opacity: 0.9; }
                .road-dash:nth-child(2) { height: 22px; animation-delay: 0.2s; opacity: 0.7; }
                .road-dash:nth-child(3) { height: 16px; animation-delay: 0.4s; opacity: 0.5; }
                .road-dash:nth-child(4) { height: 10px; animation-delay: 0.6s; opacity: 0.3; }

                @keyframes dashFade {
                    0%, 100% { opacity: 0.2; }
                    50% { opacity: 1; }
                }

                /* Animated Vehicles */
                .vehicle-scene {
                    position: absolute;
                    bottom: 15%;
                    left: 0;
                    right: 0;
                    z-index: 3;
                    height: 120px;
                    pointer-events: none;
                }

                /* Car SVG wrapper — slides in from right */
                .car-main {
                    position: absolute;
                    bottom: 12px;
                    right: 8%;
                    animation: carPark 3.2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                    filter: drop-shadow(0 12px 30px rgba(0, 150, 255, 0.35));
                }

                @keyframes carPark {
                    from { transform: translateX(160px); opacity: 0; }
                    30% { opacity: 1; }
                    to   { transform: translateX(0); opacity: 1; }
                }

                /* Parked car — already there, faint */
                .car-parked {
                    position: absolute;
                    bottom: 14px;
                    left: 12%;
                    opacity: 0.45;
                    animation: fadeCarIn 1.5s 0.8s ease forwards;
                    filter: drop-shadow(0 8px 20px rgba(30, 58, 95, 0.35));
                }

                @keyframes fadeCarIn {
                    from { opacity: 0; transform: translateX(-30px); }
                    to   { opacity: 0.45; transform: translateX(0); }
                }

                /* Headlight beams */
                .headlight-beam {
                    position: absolute;
                    bottom: 34px;
                    right: calc(8% + 158px);
                    width: 160px;
                    height: 28px;
                    background: linear-gradient(90deg, transparent 0%, rgba(255, 240, 160, 0.22) 50%, rgba(255, 240, 160, 0.05) 100%);
                    clip-path: polygon(10% 40%, 0% 0%, 100% 15%, 100% 85%, 0% 100%);
                    animation: carPark 3.2s cubic-bezier(0.22, 1, 0.36, 1) forwards, beamPulse 2.5s 3.2s ease-in-out infinite;
                    transform-origin: right center;
                }

                @keyframes beamPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }

                /* Floating Orbs / BG Shapes */
                .bg-orb {
                    position: absolute;
                    border-radius: 50%;
                    filter: blur(60px);
                    pointer-events: none;
                    z-index: 1;
                }

                .orb-1 {
                    width: 380px;
                    height: 380px;
                    background: radial-gradient(circle, rgba(30, 100, 255, 0.22) 0%, transparent 70%);
                    top: -80px;
                    left: -60px;
                    animation: orbDrift1 12s ease-in-out infinite;
                }

                .orb-2 {
                    width: 280px;
                    height: 280px;
                    background: radial-gradient(circle, rgba(251, 191, 36, 0.14) 0%, transparent 70%);
                    top: 30%;
                    right: -40px;
                    animation: orbDrift2 15s ease-in-out infinite;
                }

                .orb-3 {
                    width: 200px;
                    height: 200px;
                    background: radial-gradient(circle, rgba(0, 200, 255, 0.14) 0%, transparent 70%);
                    bottom: 30%;
                    left: 20%;
                    animation: orbDrift3 18s ease-in-out infinite;
                }

                .orb-4 {
                    width: 150px;
                    height: 150px;
                    background: radial-gradient(circle, rgba(255, 160, 30, 0.10) 0%, transparent 70%);
                    top: 55%;
                    right: 30%;
                    animation: orbDrift2 20s 3s ease-in-out infinite;
                }

                @keyframes orbDrift1 {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(30px, 20px) scale(1.05); }
                    66% { transform: translate(-15px, 35px) scale(0.96); }
                }
                @keyframes orbDrift2 {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    40% { transform: translate(-25px, -20px) scale(1.08); }
                    70% { transform: translate(10px, 30px) scale(0.95); }
                }
                @keyframes orbDrift3 {
                    0%, 100% { transform: translate(0, 0); }
                    50% { transform: translate(20px, -25px); }
                }

                /* Animated Geometric Shapes */
                .geo-shapes {
                    position: absolute;
                    inset: 0;
                    z-index: 1;
                    pointer-events: none;
                }

                .geo {
                    position: absolute;
                    border-radius: 50%;
                    border: 1.5px solid;
                    animation: geoSpin linear infinite;
                }

                .geo-1 {
                    width: 340px; height: 340px;
                    top: -60px; right: 60px;
                    border-color: rgba(60, 140, 255, 0.12);
                    animation-duration: 40s;
                    box-shadow: inset 0 0 60px rgba(60, 140, 255, 0.04);
                }

                .geo-2 {
                    width: 220px; height: 220px;
                    top: 40px; right: 110px;
                    border-color: rgba(245, 158, 11, 0.2);
                    animation-duration: 28s;
                    animation-direction: reverse;
                }

                .geo-3 {
                    width: 120px; height: 120px;
                    top: 100px; right: 170px;
                    border-color: rgba(0, 220, 255, 0.16);
                    animation-duration: 18s;
                }

                /* Square rotators */
                .geo-sq {
                    position: absolute;
                    border: 1.5px solid rgba(255, 200, 50, 0.1);
                    animation: sqSpin linear infinite;
                    border-radius: 4px;
                }

                .geo-sq-1 {
                    width: 80px; height: 80px;
                    top: 22%;
                    left: 8%;
                    animation-duration: 22s;
                }

                .geo-sq-2 {
                    width: 48px; height: 48px;
                    top: 38%;
                    left: 18%;
                    border-color: rgba(100, 200, 255, 0.12);
                    animation-duration: 14s;
                    animation-direction: reverse;
                }

                .geo-sq-3 {
                    width: 32px; height: 32px;
                    top: 15%;
                    left: 38%;
                    border-color: rgba(147, 197, 253, 0.2);
                    animation-duration: 10s;
                }

                @keyframes geoSpin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }

                @keyframes sqSpin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }

                /* Floating Icon Chips */
                .float-chips {
                    position: absolute;
                    inset: 0;
                    z-index: 2;
                    pointer-events: none;
                }

                .chip {
                    position: absolute;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 0.9rem;
                    border-radius: 999px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    font-family: 'Outfit', sans-serif;
                    letter-spacing: 0.02em;
                    backdrop-filter: blur(12px);
                    border: 1px solid;
                    animation: chipFloat ease-in-out infinite;
                }

                .chip i { font-size: 0.8rem; }

                .chip-spots {
                    top: 12%;
                    left: 6%;
                    background: rgba(0, 200, 100, 0.12);
                    border-color: rgba(0, 200, 100, 0.28);
                    color: #4ade80;
                    animation-duration: 5s;
                    animation-delay: 0s;
                }

                .chip-scan {
                    top: 20%;
                    right: 8%;
                    background: rgba(60, 140, 255, 0.12);
                    border-color: rgba(60, 140, 255, 0.28);
                    color: #60a5fa;
                    animation-duration: 6s;
                    animation-delay: 1s;
                }

                .chip-live {
                    top: 8%;
                    right: 22%;
                    background: rgba(255, 80, 80, 0.12);
                    border-color: rgba(255, 80, 80, 0.28);
                    color: #f87171;
                    animation-duration: 4.5s;
                    animation-delay: 0.5s;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }

                .live-dot {
                    width: 6px;
                    height: 6px;
                    background: #f87171;
                    border-radius: 50%;
                    animation: livePulse 1.2s ease infinite;
                }

                @keyframes livePulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.5); opacity: 0.5; }
                }

                @keyframes chipFloat {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-8px); }
                }

                /* BRAND CONTENT (text) */
                .brand-content {
                    position: relative;
                    z-index: 5;
                    color: #fff;
                    max-width: 480px;
                    animation: slideUp 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }

                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(28px); }
                    to   { opacity: 1; transform: translateY(0); }
                }

                .brand-eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-family: 'Outfit', sans-serif;
                    font-size: 0.7rem;
                    font-weight: 700;
                    letter-spacing: 0.18em;
                    text-transform: uppercase;
                    color: rgba(255, 220, 60, 0.9);
                    background: rgba(255, 220, 60, 0.08);
                    border: 1px solid rgba(255, 220, 60, 0.2);
                    padding: 0.35rem 0.85rem;
                    border-radius: 999px;
                    margin-bottom: 1.4rem;
                }

                .brand-title-lg {
                    font-family: 'Outfit', sans-serif;
                    font-size: 3.8rem;
                    font-weight: 900;
                    line-height: 1.0;
                    letter-spacing: -0.03em;
                    margin-bottom: 0.5rem;
                }

                .brand-tagline {
                    font-size: 1rem;
                    color: rgba(180, 200, 240, 0.75);
                    line-height: 1.65;
                    margin-bottom: 2.2rem;
                    max-width: 340px;
                    font-weight: 400;
                }

                /* Stats row */
                .brand-stats {
                    display: flex;
                    gap: 2.5rem;
                    align-items: flex-start;
                }

                .stat-item {
                    display: flex;
                    flex-direction: column;
                    gap: 0.2rem;
                }

                .stat-num {
                    font-family: 'Outfit', sans-serif;
                    font-size: 1.7rem;
                    font-weight: 800;
                    color: #fff;
                    line-height: 1;
                    letter-spacing: -0.02em;
                }

                .stat-num span {
                    color: #fbbf24;
                }

                .stat-label {
                    font-size: 0.72rem;
                    font-weight: 500;
                    color: rgba(160, 185, 220, 0.7);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }

                .stat-divider {
                    width: 1px;
                    height: 40px;
                    background: rgba(255,255,255,0.12);
                    margin-top: 4px;
                }

                /* Ambient glow on caret */
                .brand-logo-mark {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 56px;
                    height: 56px;
                    border-radius: 16px;
                    background: linear-gradient(135deg, rgba(30, 58, 95, 0.45) 0%, rgba(15, 23, 42, 0.6) 100%);
                    border: 1px solid rgba(251, 191, 36, 0.35);
                    margin-bottom: 1.5rem;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 0 28px rgba(30, 58, 95, 0.35);
                }

                .brand-logo-mark i {
                    font-size: 1.5rem;
                    color: #fff;
                }

                /* RIGHT FORM PANEL */
                .login-form-panel {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--surface-page, linear-gradient(160deg, #e8eef7 0%, #f1f5f9 50%, #eef2f7 100%));
                    padding: 2rem 1.5rem;
                }

                .login-form-inner {
                    width: 100%;
                    max-width: 400px;
                    animation: formSlide 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }

                @keyframes formSlide {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }

                /* Mobile logo */
                .mobile-brand {
                    text-align: center;
                    margin-bottom: 2.5rem;
                    padding-top: 1.5rem;
                }

                .mobile-logo {
                    width: 68px;
                    height: 68px;
                    border-radius: 20px;
                    background: #0d1f3c;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 0.75rem;
                    box-shadow: 0 8px 24px rgba(10, 30, 80, 0.35);
                }

                .mobile-logo i {
                    font-size: 1.8rem;
                    color: #fff;
                }

                .mobile-app-name {
                    display: flex;
                    justify-content: center;
                    margin-top: 0.25rem;
                }

                /* Form headings */
                .login-heading {
                    font-family: 'Outfit', sans-serif;
                    font-size: 1.85rem;
                    font-weight: 800;
                    color: #0d1f3c;
                    margin-bottom: 0.3rem;
                    letter-spacing: -0.02em;
                }

                .login-subheading {
                    font-size: 0.9rem;
                    color: #64748b;
                    margin-bottom: 2rem;
                    font-weight: 400;
                }

                /* Form */
                .login-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                }

                .input-group {
                    position: relative;
                }

                .input-group .icon-left {
                    position: absolute;
                    left: 1rem;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #94a3b8;
                    font-size: 0.9rem;
                    pointer-events: none;
                    transition: color 0.25s ease;
                    z-index: 1;
                }

                .input-group input {
                    width: 100%;
                    padding: 0.9rem 1rem 0.9rem 2.75rem;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    font-size: 0.95rem;
                    font-family: 'DM Sans', sans-serif;
                    background: rgba(255, 255, 255, 0.85);
                    backdrop-filter: blur(6px);
                    color: #1e293b;
                    transition: border-color 0.25s ease, box-shadow 0.25s ease;
                    outline: none;
                }

                .input-group input::placeholder { color: #94a3b8; }

                .input-group input:focus {
                    border-color: #1a3a6b;
                    box-shadow: 0 0 0 4px rgba(20, 60, 140, 0.1);
                    background: #fff;
                }

                .input-group input:focus + .icon-left,
                .input-group input:focus ~ .icon-left {
                    color: #1a3a6b;
                }

                .password-input { padding-right: 3rem !important; }

                .toggle-password {
                    position: absolute;
                    right: 1rem;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: #94a3b8;
                    font-size: 0.9rem;
                    padding: 0;
                    transition: color 0.2s ease;
                }

                .toggle-password:hover { color: #1a3a6b; }

                .forgot-row {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: -0.5rem;
                }

                .forgot-link {
                    font-size: 0.8rem;
                    color: #64748b;
                    text-decoration: none;
                    transition: color 0.2s ease;
                    cursor: pointer;
                }

                .forgot-link:hover { color: #1a3a6b; }

                /* Submit button */
                .login-btn {
                    width: 100%;
                    padding: 0.95rem;
                    border: none;
                    border-radius: 12px;
                    font-size: 1rem;
                    font-weight: 700;
                    font-family: 'Outfit', sans-serif;
                    letter-spacing: 0.01em;
                    cursor: pointer;
                    color: #fff;
                    background: var(--primary-gradient, linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%));
                    box-shadow: 0 4px 18px rgba(15, 23, 42, 0.35);
                    transition: box-shadow 0.25s ease, transform 0.25s ease, background 0.25s ease;
                    margin-top: 0.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    position: relative;
                    overflow: hidden;
                }

                .login-btn::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%);
                    pointer-events: none;
                }

                .login-btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(251, 191, 36, 0.35);
                    background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
                }

                .login-btn:active:not(:disabled) { transform: translateY(0); }

                .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }

                @keyframes login-spin { to { transform: rotate(360deg); } }
                .login-spinner { animation: login-spin 0.8s linear infinite; }

                /* DESKTOP */
                @media (min-width: 768px) {
                    .login-brand-panel { display: flex; }

                    .login-form-panel {
                        width: 42%;
                        background: #ffffff;
                        box-shadow: -10px 0 40px rgba(0,0,0,0.08);
                    }

                    .mobile-brand { display: none; }

                    .login-form-inner { max-width: 360px; }

                    .login-heading { font-size: 1.7rem; }
                }

                @media (min-width: 1200px) {
                    .brand-title-lg { font-size: 4.4rem; }
                    .login-brand-panel { padding: 4rem; }
                }
            `}</style>

            <div className="login-page">
                {/* LEFT BRAND PANEL */}
                <div className="login-brand-panel">

                    {/* Ambient orbs */}
                    <div className="bg-orb orb-1"></div>
                    <div className="bg-orb orb-2"></div>
                    <div className="bg-orb orb-3"></div>
                    <div className="bg-orb orb-4"></div>

                    {/* Geometric ring spinners */}
                    <div className="geo-shapes">
                        <div className="geo geo-1"></div>
                        <div className="geo geo-2"></div>
                        <div className="geo geo-3"></div>
                        <div className="geo-sq geo-sq-1"></div>
                        <div className="geo-sq geo-sq-2"></div>
                        <div className="geo-sq geo-sq-3"></div>
                    </div>

                    {/* Floating status chips */}
                    <div className="float-chips">
                        <div className="chip chip-spots">
                            <i className="fas fa-circle-check"></i>
                            Siap Pakai
                        </div>
                        <div className="chip chip-scan">
                            <i className="fas fa-barcode"></i>
                            Scan Barcode Tiket
                        </div>
                        <div className="chip chip-live">
                            <span className="live-dot"></span>
                            Pemantauan Langsung
                        </div>
                    </div>

                    {/* Tarmac ground */}
                    <div className="tarmac">
                        <div className="road-lines">
                            <div className="road-dash"></div>
                            <div className="road-dash"></div>
                            <div className="road-dash"></div>
                            <div className="road-dash"></div>
                        </div>
                    </div>

                    {/* Vehicle scene */}
                    <div className="vehicle-scene">
                        {/* Headlight beam */}
                        <div className="headlight-beam"></div>

                        {/* Main car (drives in) */}
                        <div className="car-main">
                            <svg width="180" height="80" viewBox="0 0 180 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="10" y="38" width="160" height="28" rx="6" fill="url(#carBody)" />
                                <path d="M30 38 Q40 16 65 16 L120 16 Q148 16 155 38Z" fill="url(#carRoof)" />
                                {/* Windows */}
                                <path d="M68 18 Q73 18 75 22 L74 36 L50 36 L52 22 Q56 18 68 18Z" fill="rgba(160,210,255,0.55)" stroke="rgba(200,230,255,0.3)" strokeWidth="1" />
                                <path d="M78 18 L118 18 L118 36 L76 36Z" fill="rgba(160,210,255,0.5)" stroke="rgba(200,230,255,0.3)" strokeWidth="1" />
                                <path d="M120 18 Q134 18 140 26 L140 36 L120 36Z" fill="rgba(140,200,255,0.4)" stroke="rgba(200,230,255,0.25)" strokeWidth="1" />
                                {/* Wheels */}
                                <circle cx="42" cy="66" r="14" fill="#1a1a2e" stroke="#2d3a5e" strokeWidth="2" />
                                <circle cx="42" cy="66" r="7" fill="#2a3550" stroke="rgba(100,150,255,0.4)" strokeWidth="1.5" />
                                <circle cx="138" cy="66" r="14" fill="#1a1a2e" stroke="#2d3a5e" strokeWidth="2" />
                                <circle cx="138" cy="66" r="7" fill="#2a3550" stroke="rgba(100,150,255,0.4)" strokeWidth="1.5" />
                                {/* Headlights */}
                                <ellipse cx="167" cy="46" rx="6" ry="4" fill="rgba(255,240,160,0.9)" />
                                <ellipse cx="167" cy="54" rx="5" ry="3" fill="rgba(255,200,60,0.7)" />
                                {/* Tail lights */}
                                <rect x="10" y="42" width="6" height="8" rx="2" fill="rgba(255,80,80,0.85)" />
                                {/* Door line */}
                                <line x1="93" y1="38" x2="90" y2="64" stroke="rgba(80,120,200,0.25)" strokeWidth="1.5" />
                                {/* Door handle */}
                                <rect x="95" y="50" width="12" height="3" rx="1.5" fill="rgba(100,160,255,0.35)" />
                                <defs>
                                    <linearGradient id="carBody" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#1e3a72" />
                                        <stop offset="100%" stopColor="#0d1f48" />
                                    </linearGradient>
                                    <linearGradient id="carRoof" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#2a4e8c" />
                                        <stop offset="100%" stopColor="#1a3060" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>

                        {/* Parked car (faded, already there) */}
                        <div className="car-parked">
                            <svg width="140" height="70" viewBox="0 0 140 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="8" y="32" width="124" height="26" rx="5" fill="#1e293b" />
                                <path d="M22 32 Q30 14 52 14 L92 14 Q115 14 120 32Z" fill="#334155" />
                                <path d="M54 15 Q58 15 60 19 L58 30 L38 30 L40 19 Q44 15 54 15Z" fill="rgba(100,140,200,0.35)" />
                                <path d="M62 15 L90 15 L90 30 L60 30Z" fill="rgba(100,140,200,0.3)" />
                                <circle cx="34" cy="58" r="12" fill="#120f22" stroke="#2a2040" strokeWidth="1.5" />
                                <circle cx="34" cy="58" r="6" fill="#1e1838" />
                                <circle cx="108" cy="58" r="12" fill="#120f22" stroke="#2a2040" strokeWidth="1.5" />
                                <circle cx="108" cy="58" r="6" fill="#1e1838" />
                            </svg>
                        </div>
                    </div>

                    {/* Brand text */}
                    <div className="brand-content">
                        <div className="brand-logo-mark">
                            <i className="fas fa-location-dot"></i>
                        </div>

                        <div className="brand-eyebrow">
                            <i className="fas fa-bolt"></i>
                            Sistem Parkir Cerdas
                        </div>

                        <h1 className="brand-title-lg">
                            <span className="text-gradient-park block">Park</span>
                            <span className="text-gradient-here block">Here.</span>
                        </h1>

                        <p className="brand-tagline">
                            Pemantauan slot parkir secara real time dengan pencatatan kendaraan semua terintegrasi di satu sistem.
                        </p>

                        <div className="brand-stats">
                            <div className="stat-item">
                                <div className="stat-num">100<span>%</span></div>
                                <div className="stat-label">Kinerja Terjaga</div>
                            </div>
                            <div className="stat-divider"></div>
                            <div className="stat-item">
                                <div className="stat-num">3<span> detik</span></div>
                                <div className="stat-label">Waktu Check-in</div>
                            </div>
                            <div className="stat-divider"></div>
                            <div className="stat-item">
                                <div className="stat-num">24<span>/7</span></div>
                                <div className="stat-label">Pemantauan Langsung</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT FORM PANEL */}
                <div className="login-form-panel">
                    <div className="login-form-inner">
                        {/* Mobile-only logo */}
                        <div className="mobile-brand">
                            <div className="mobile-logo">
                                <i className="fas fa-location-dot"></i>
                            </div>
                            <div className="mobile-app-name">
                                <BrandWordmark size="lg" variant="dark" />
                            </div>
                        </div>

                        <h2 className="login-heading">Selamat Datang Kembali</h2>
                        <p className="login-subheading">Login untuk masuk ke dashboard</p>

                        <form className="login-form" onSubmit={handleSubmit}>
                            {/* Username */}
                            <div className="input-group">
                                <input
                                    id="login-username"
                                    type="text"
                                    placeholder="Username"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    autoComplete="username"
                                />
                                <span className="icon-left">
                                    <i className="fas fa-user"></i>
                                </span>
                            </div>

                            {/* Password */}
                            <div className="input-group">
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    className="password-input"
                                    placeholder="Password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    autoComplete="current-password"
                                />
                                <span className="icon-left">
                                    <i className="fas fa-lock"></i>
                                </span>
                                <button
                                    type="button"
                                    className="toggle-password"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>

                            {/* Submit */}
                            <button
                                id="login-submit"
                                type="submit"
                                className="login-btn"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <i className="fas fa-circle-notch login-spinner"></i>
                                        Signing in…
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-arrow-right-to-bracket"></i>
                                        Sign In
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Login;