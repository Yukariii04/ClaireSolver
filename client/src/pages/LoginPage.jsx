import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth, googleProvider, isFirebaseConfigured } from '../config/firebase.js';
import { authErrorMessage } from '../lib/authErrors.js';

export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const destination = location.state?.from?.pathname || '/dashboard';

  async function handleEmailSubmit(event) {
    event.preventDefault();
    setError('');

    if (!isFirebaseConfigured || !auth) {
      // In demo/offline mode, navigate immediately to dashboard
      navigate(destination, { replace: true });
      return;
    }

    setIsSubmitting(true);
    try {
      if (isCreatingAccount) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      navigate(destination, { replace: true });
    } catch (authError) {
      setError(authErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');

    if (!isFirebaseConfigured || !auth) {
      navigate(destination, { replace: true });
      return;
    }

    setIsSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate(destination, { replace: true });
    } catch (authError) {
      setError(authErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="bg-desktop-dither min-h-screen text-[#0F172A] font-mono flex flex-col justify-between selection:bg-[#00F0FF] selection:text-[#0F172A]">
      {/* Top Retro System Header Bar */}
      <header className="bg-[#D4D0C8] border-b-2 border-[#808080] border-t-2 border-l-2 border-white flex justify-between items-center w-full px-2 py-1 select-none z-50">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="bevel-button bg-[#D4D0C8] text-[#0F172A] px-2.5 py-0.5 flex items-center gap-1.5 text-xs font-bold active:translate-x-0.5 active:translate-y-0.5 shadow-sm"
          >
            <span className="bg-gradient-to-r from-blue-700 via-[#00F0FF] to-[#FF2E93] text-white text-[11px] font-extrabold px-1 border border-black">
              ∑
            </span>
            <span>Start</span>
          </button>
          <span className="text-xs font-bold text-[#000080] tracking-wider px-2 border-r border-[#808080] hidden sm:inline-block">
            CYBER_OS::v2.0 [ClaireSolver v2.5]
          </span>
          <nav className="hidden md:flex items-center gap-3 text-xs text-[#0F172A]">
            <span className="hover:bg-[#000080] hover:text-white px-1.5 py-0.5 cursor-pointer">File</span>
            <span className="hover:bg-[#000080] hover:text-white px-1.5 py-0.5 cursor-pointer">Network</span>
            <span className="hover:bg-[#000080] hover:text-white px-1.5 py-0.5 cursor-pointer">Help</span>
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" aria-label="Minimize" className="w-5 h-5 bg-[#D4D0C8] bevel-raised-sm flex items-center justify-center text-[10px] font-bold">_</button>
          <button type="button" aria-label="Maximize" className="w-5 h-5 bg-[#D4D0C8] bevel-raised-sm flex items-center justify-center text-[10px] font-bold">□</button>
          <button type="button" aria-label="Close" className="w-5 h-5 bg-[#D4D0C8] bevel-raised-sm flex items-center justify-center text-[10px] font-bold text-red-600">✕</button>
        </div>
      </header>

      {/* Main Desktop Canvas with Centered Setup Wizard */}
      <main className="relative flex-1 w-full flex items-center justify-center p-3 sm:p-6">
        {/* Retro Desktop Icons */}
        <div className="absolute top-4 left-4 hidden lg:flex flex-col gap-5 pointer-events-auto select-none">
          <div className="flex flex-col items-center w-16 group cursor-pointer" onClick={() => navigate('/dashboard')}>
            <div className="w-10 h-10 bg-[#1e1f26] border border-white/50 flex items-center justify-center text-[#00F0FF] shadow">
              <span className="text-xl">📁</span>
            </div>
            <span className="text-white text-[11px] mt-1 px-1 group-hover:bg-[#000080] text-center">Math_Worksheets</span>
          </div>
          <div className="flex flex-col items-center w-16 group cursor-pointer">
            <div className="w-10 h-10 bg-[#1e1f26] border border-white/50 flex items-center justify-center text-[#39FF14] shadow">
              <span className="text-xl">⚡</span>
            </div>
            <span className="text-white text-[11px] mt-1 px-1 group-hover:bg-[#000080] text-center">SymPy_Core</span>
          </div>
          <div className="flex flex-col items-center w-16 group cursor-pointer">
            <div className="w-10 h-10 bg-[#1e1f26] border border-white/50 flex items-center justify-center text-[#C4B5FD] shadow">
              <span className="text-xl">🎙️</span>
            </div>
            <span className="text-white text-[11px] mt-1 px-1 group-hover:bg-[#000080] text-center">Prisma_STT</span>
          </div>
        </div>

        {/* WINDOW MODAL: ClaireSolver Setup Wizard v2.5 */}
        <div className="relative w-full max-w-[820px] bg-[#D4D0C8] window-outer-chassis p-1 flex flex-col z-20">
          <div className="border border-[#808080] p-0.5 flex flex-col bg-[#D4D0C8]">
            {/* Window Title Bar */}
            <div className="h-7 bg-gradient-to-r from-[#000080] to-[#1084D0] px-2 flex items-center justify-between text-white select-none">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-[#D4D0C8] text-[#000080] bevel-sunken flex items-center justify-center font-bold text-xs leading-none">
                  ∑
                </div>
                <span className="text-xs font-bold tracking-wide text-white drop-shadow-[1px_1px_0px_#000000]">
                  User Authentication &amp; License Key [ClaireSolver v2.5]
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="w-4 h-4 bg-[#D4D0C8] text-[#0F172A] bevel-raised-sm flex items-center justify-center text-[10px] leading-none font-bold">_</button>
                <button type="button" className="w-4 h-4 bg-[#D4D0C8] text-[#0F172A] bevel-raised-sm flex items-center justify-center text-[9px] leading-none font-bold">□</button>
                <button type="button" className="w-4 h-4 bg-[#D4D0C8] text-red-600 bevel-raised-sm flex items-center justify-center text-[10px] leading-none font-bold">✕</button>
              </div>
            </div>

            {/* Window Body: Two Columns */}
            <div className="flex flex-col md:flex-row mt-1 gap-1">
              {/* Left Column: CRT Dark Cyber Banner */}
              <section className="w-full md:w-[260px] bg-[#0d0e15] border-2 border-[#808080] relative overflow-hidden flex flex-col justify-between p-3.5 text-[#e3e1ec]">
                <div className="scanlines-overlay absolute inset-0 pointer-events-none z-10" />

                <div className="relative z-20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase tracking-widest text-[#00F0FF] bg-[#1e1f26] px-1 border border-[#00F0FF]/40">
                      KERNEL::MATH-32.DLL
                    </span>
                    <span className="w-2 h-2 bg-[#39FF14] animate-ping" />
                  </div>
                  <h2 className="text-base text-white tracking-wider font-extrabold uppercase mt-1">
                    ClaireSolver
                  </h2>
                  <p className="text-[10px] text-slate-400">
                    BUILD 2195.RT // REL_04
                  </p>
                </div>

                {/* Wireframe Geometric Math Illustration Vector */}
                <div className="relative z-20 my-4 flex flex-col items-center justify-center">
                  <div className="w-44 h-44 relative flex items-center justify-center border border-[#00F0FF]/20 bg-[#0d0e15]/90">
                    <svg className="w-40 h-40" fill="none" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="80" cy="80" r="65" stroke="#34343C" strokeDasharray="3 3" strokeWidth="1" />
                      <ellipse cx="80" cy="80" opacity="0.85" rx="70" ry="32" stroke="#00F0FF" strokeWidth="1.2" />
                      <ellipse cx="80" cy="80" opacity="0.75" rx="32" ry="70" stroke="#C4B5FD" strokeWidth="1.2" />
                      <ellipse cx="80" cy="80" opacity="0.6" rx="55" ry="55" stroke="#FF2E93" strokeDasharray="4 2" strokeWidth="0.8" />
                      <line opacity="0.6" stroke="#00F0FF" strokeWidth="0.75" x1="15" x2="145" y1="80" y2="80" />
                      <line opacity="0.6" stroke="#00F0FF" strokeWidth="0.75" x1="80" x2="80" y1="15" y2="145" />
                      <path d="M 20 80 Q 80 20 140 80" fill="none" stroke="#00F0FF" strokeWidth="1.5" />
                      <path d="M 20 80 Q 80 140 140 80" fill="none" stroke="#C4B5FD" strokeWidth="1.5" />
                      <rect fill="#00F0FF" height="6" width="6" x="77" y="77" />
                      <text fill="#00F0FF" fontFamily="Space Mono" fontSize="8" x="88" y="74">∫f(x)dx</text>
                      <text fill="#FF2E93" fontFamily="Space Mono" fontSize="8" x="25" y="130">λ=1.618</text>
                    </svg>
                    {/* Starburst Badge */}
                    <div className="absolute -bottom-3 -right-2 bg-[#39FF14] text-black text-[9px] font-black uppercase px-2 py-0.5 border border-black shadow-[2px_2px_0px_#000000] rotate-[-4deg] tracking-tighter">
                      ★ AI TUTOR ENABLED
                    </div>
                  </div>
                </div>

                {/* Footer Stats in Sidebar */}
                <div className="relative z-20 space-y-1 pt-2 border-t border-[#808080] text-[10px] text-slate-400">
                  <div className="flex justify-between">
                    <span>STATION_ID:</span>
                    <span className="text-[#00F0FF] font-bold">#01_LAB</span>
                  </div>
                  <div className="flex justify-between">
                    <span>MEM_PAGING:</span>
                    <span className="text-[#39FF14] font-bold">640K OK</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SUBSYSTEM:</span>
                    <span className="text-[#C4B5FD] font-bold">PRISMA-16</span>
                  </div>
                </div>
              </section>

              {/* Right Column: Form Pane */}
              <section className="flex-1 bg-[#D4D0C8] p-3 sm:p-4 flex flex-col justify-between">
                <div>
                  <div className="border-b-2 border-[#808080] pb-2 mb-3">
                    <h1 className="text-sm sm:text-base font-bold text-[#0F172A] tracking-tight flex items-center gap-1.5">
                      <span className="text-[#000080]">▶</span>
                      {isCreatingAccount ? 'Student Registration Wizard' : 'Student Identification & Workspace Setup'}
                    </h1>
                    <p className="text-xs text-slate-700 mt-0.5">
                      Enter credentials or continue in demo mode to initialize neural solver sessions.
                    </p>
                  </div>

                  {error && (
                    <div className="mb-3 bg-red-100 border-2 border-red-500 p-2 text-xs font-bold text-red-900 bevel-sunken">
                      [SYS_ERR]: {error}
                    </div>
                  )}

                  <form onSubmit={handleEmailSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-[#0F172A] mb-1">
                        Student Institutional ID / Email:
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="claire.student@algebra.edu"
                        className="w-full bg-[#FDFDFE] text-[#0F172A] font-mono text-xs px-2.5 py-1.5 bevel-sunken-field focus:outline-none focus:ring-1 focus:ring-[#00F0FF]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-[#0F172A]">
                          Password or Math-Key:
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsCreatingAccount(!isCreatingAccount)}
                          className="text-[10px] text-[#000080] hover:underline"
                        >
                          {isCreatingAccount ? 'Switch to Sign In' : 'Need an account?'}
                        </button>
                      </div>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="w-full bg-[#FDFDFE] text-[#0F172A] font-mono text-xs px-2.5 py-1.5 bevel-sunken-field focus:outline-none focus:ring-1 focus:ring-[#00F0FF] tracking-widest"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      <input defaultChecked className="win-checkbox" id="winini" type="checkbox" />
                      <label className="text-xs text-[#0F172A] cursor-pointer select-none" htmlFor="winini">
                        Save token in local <code className="bg-[#EFECE6] px-1 font-bold">WIN.INI</code> configuration
                      </label>
                    </div>

                    {/* Google SSO Button */}
                    <div className="pt-2">
                      <div className="text-[10px] uppercase tracking-wider text-[#808080] mb-1">
                        -- Federated Authentication Protocol --
                      </div>
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isSubmitting}
                        className="w-full bg-[#D4D0C8] text-[#0F172A] bevel-raised px-3 py-1.5 flex items-center justify-center gap-2 bevel-button-pressed hover:bg-[#DDD8D0] disabled:opacity-60"
                      >
                        <span className="font-bold text-xs tracking-tight">
                          <span className="text-[#4285F4]">G</span>
                          <span className="text-[#EA4335]">o</span>
                          <span className="text-[#FBBC05]">o</span>
                          <span className="text-[#4285F4]">g</span>
                          <span className="text-[#34A853]">l</span>
                          <span className="text-[#EA4335]">e</span>
                        </span>
                        <span className="text-xs font-bold">Campus Single Sign-On (Direct)</span>
                      </button>
                    </div>

                    {/* SoundBlaster Segmented Audio Visualizer (Gnani Prisma STT) */}
                    <div className="bg-[#C8C4BC] p-2 border border-[#808080] mt-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-[#39FF14] border border-black animate-pulse" />
                          <span className="text-[10px] font-bold text-[#0F172A]">
                            Gnani Prisma Ear Ready: 16kHz
                          </span>
                        </div>
                        <span className="text-[10px] text-[#006970] font-bold">
                          LATENCY: 12ms
                        </span>
                      </div>
                      <div className="h-4 bg-[#0F172A] border border-[#808080] flex items-center px-1 gap-[2px]">
                        <span className="w-1.5 h-2 bg-[#39FF14]" />
                        <span className="w-1.5 h-2.5 bg-[#39FF14]" />
                        <span className="w-1.5 h-3 bg-[#39FF14]" />
                        <span className="w-1.5 h-2 bg-[#00F0FF]" />
                        <span className="w-1.5 h-3.5 bg-[#00F0FF]" />
                        <span className="w-1.5 h-2 bg-[#FF2E93]" />
                        <span className="w-1.5 h-1 bg-[#808080]" />
                        <span className="w-1.5 h-1 bg-[#808080]" />
                      </div>
                    </div>

                    {/* Submit Bar */}
                    <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#808080]">
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard')}
                        className="bevel-button bg-[#D4D0C8] px-3 py-1.5 text-xs text-[#000080] font-bold hover:bg-[#DDD8D0]"
                      >
                        ⚡ Enter Demo Mode
                      </button>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bevel-button bg-[#00F0FF] text-[#00363a] px-4 py-1.5 text-xs font-black bevel-button-pressed border-2 shadow hover:brightness-105 disabled:opacity-60 flex items-center gap-1.5"
                      >
                        <span>{isSubmitting ? 'Verifying…' : isCreatingAccount ? 'Create Account' : 'Initialize Classroom →'}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Inset Status Groove */}
                <div className="mt-4 pt-2 border-t-2 border-[#808080] flex items-center justify-between text-[10px] font-bold text-slate-600">
                  <span className="bevel-inset bg-[#C8C4BC] px-2 py-0.5">
                    SYS_STATUS: READY // 0 ERRORS
                  </span>
                  <span>BUILD_TAG: Y2K_STITCH_REL</span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Taskbar / Status Footer */}
      <footer className="bg-[#D4D0C8] border-t-2 border-white px-2 py-1 text-xs text-slate-700 flex justify-between select-none">
        <span className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#39FF14]" />
          <span>ClaireSolver Neural Math Engine Active</span>
        </span>
        <span>Version 2.5.0-Y2K</span>
      </footer>
    </div>
  );
}
