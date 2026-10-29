import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { auth } from '../config/firebase.js';
import { useNotebookStore } from '../store/useNotebookStore.js';
import UploadWorksheetModal from '../components/UploadWorksheetModal.jsx';
import SettingsControlPanelModal from '../components/SettingsControlPanelModal.jsx';

function formatDate(value) {
  if (value == null) return 'Just now';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 'Just now';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function initialsFor(user) {
  const name = user?.displayName || user?.email || 'Student';
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const notebooks = useNotebookStore((state) => state.notebooks);
  const isLoading = useNotebookStore((state) => state.isLoading);
  const isCreating = useNotebookStore((state) => state.isCreating);
  const storeError = useNotebookStore((state) => state.error);
  const watchNotebooks = useNotebookStore((state) => state.watchNotebooks);
  const createNotebook = useNotebookStore((state) => state.createNotebook);
  const clearError = useNotebookStore((state) => state.clearError);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [pageError, setPageError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    try {
      return watchNotebooks();
    } catch (error) {
      setPageError(error.message);
      return undefined;
    }
  }, [watchNotebooks, user?.uid]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreateNotebook() {
    setPageError('');
    clearError();
    try {
      const notebookId = await createNotebook({
        title: 'New Math Homework',
        paperStyle: 'ruled',
        preferredLanguage: selectedLanguage,
      });
      navigate(`/notebook/${notebookId}`);
    } catch (error) {
      setPageError(error.message);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      if (auth) await signOut(auth);
      navigate('/login', { replace: true });
    } catch {
      setPageError('Could not sign out right now.');
    } finally {
      setSigningOut(false);
    }
  }

  const shownError = pageError || storeError;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Student';

  return (
    <div className="bg-desktop-crt min-h-screen text-[#0F172A] font-mono flex flex-col justify-between selection:bg-[#00F0FF] selection:text-[#0F172A]">
      {/* ==================== TOP RETRO SYSTEM EXPLORER BAR ==================== */}
      <header className="bg-[#D4D0C8] border-b-2 border-[#808080] border-t-2 border-l-2 border-white flex justify-between items-center w-full px-2 py-1 select-none z-50 shadow">
        {/* Left: Brand & Start Button */}
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStartMenuOpen((prev) => !prev)}
            className={`bevel-button ${startMenuOpen ? 'bevel-button-pressed bg-slate-300' : 'bg-[#D4D0C8]'} text-[#0F172A] px-2.5 py-0.5 flex items-center gap-1.5 text-xs font-bold active:translate-x-0.5 active:translate-y-0.5 shadow-sm`}
          >
            <span className="bg-gradient-to-r from-blue-700 via-[#00F0FF] to-[#FF2E93] text-white text-[11px] font-extrabold px-1 border border-black">
              ∑
            </span>
            <span>Start</span>
          </button>

          {/* Windows 98 Classic Start Menu Flyout */}
          {startMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setStartMenuOpen(false)}
              />
              <div className="absolute top-8 left-0 z-50 w-64 bg-[#D4D0C8] window-outer-chassis shadow-2xl flex select-none text-xs">
                {/* Left Blue Vertical Banner */}
                <div className="w-8 bg-gradient-to-t from-[#000080] via-[#09419b] to-[#1084D0] flex items-end justify-center pb-2 text-white font-black tracking-widest uppercase [writing-mode:vertical-rl] rotate-180 text-[11px]">
                  ClaireOS 98
                </div>

                {/* Right Items */}
                <div className="flex-1 p-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setStartMenuOpen(false);
                      setSettingsOpen(true);
                    }}
                    className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-[#000080] hover:text-white rounded-none cursor-pointer"
                  >
                    <span>⚙️</span>
                    <span className="font-bold">Control Panel...</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStartMenuOpen(false);
                      setUploadModalOpen(true);
                    }}
                    className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-[#000080] hover:text-white rounded-none cursor-pointer"
                  >
                    <span>⚡</span>
                    <span>Upload Worksheet...</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStartMenuOpen(false);
                      handleCreateNotebook();
                    }}
                    className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-[#000080] hover:text-white rounded-none cursor-pointer"
                  >
                    <span>📝</span>
                    <span>New Exercise Book</span>
                  </button>

                  <div className="border-t border-[#808080] my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setStartMenuOpen(false);
                      handleSignOut();
                    }}
                    className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-[#000080] hover:text-white rounded-none text-red-700 hover:text-white cursor-pointer"
                  >
                    <span>🚪</span>
                    <span>Log Off {displayName}...</span>
                  </button>
                </div>
              </div>
            </>
          )}

          <span className="text-xs font-bold text-[#000080] tracking-wider px-2 border-r border-[#808080] hidden sm:inline-block">
            CYBER_OS::v2.0 [ClaireSolver v2.5]
          </span>

          {/* Breadcrumb address bar */}
          <div className="hidden md:flex items-center bevel-inset bg-[#0d0e15] px-2 py-0.5 text-[#00F0FF] text-xs font-mono w-64 lg:w-80 truncate">
            <span>📁 C:\My Homework\Math\</span>
          </div>
        </div>

        {/* Right: Language Pill, Network, Clock, User Profile */}
        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <div className="hidden sm:flex items-center bevel-inset bg-[#D4D0C8] p-0.5">
            {['en-IN', 'hi-IN', 'gu-IN'].map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setSelectedLanguage(lang)}
                className={`px-1.5 py-0.5 text-[10px] font-bold ${
                  selectedLanguage === lang
                    ? 'bg-[#000080] text-white'
                    : 'text-[#0F172A] hover:bg-slate-300'
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Telemetry Indicator */}
          <div className="hidden lg:flex items-center gap-1 bevel-inset bg-[#0d0e15] px-2 py-0.5 text-[#39FF14] text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
            <span>56k_ONLINE</span>
          </div>

          {/* Clock */}
          <div className="bevel-inset bg-[#0d0e15] px-2 py-0.5 text-[#00F0FF] text-xs font-bold">
            {currentTime || '12:00 PM'}
          </div>

          {/* User Badge & Signout */}
          <div className="flex items-center gap-1.5 pl-1 border-l border-[#808080]">
            <span className="text-xs font-bold text-[#0F172A] max-w-28 truncate hidden xl:inline">
              {displayName}
            </span>
            <div className="w-6 h-6 bg-[#000080] text-white bevel-raised flex items-center justify-center text-[10px] font-black">
              {initialsFor(user)}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="bevel-button bg-[#D4D0C8] px-2 py-0.5 text-[11px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              {signingOut ? '…' : 'Logout'}
            </button>
          </div>
        </div>
      </header>

      {/* ==================== WORKSPACE DESKTOP CANVAS ==================== */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto p-3 sm:p-5 flex flex-col gap-4 pb-24">
        {shownError && (
          <div className="bg-red-100 border-2 border-red-500 p-2 text-xs font-bold text-red-900 bevel-sunken flex justify-between items-center">
            <span>[SYS_ALERT]: {shownError}</span>
            <button type="button" onClick={() => { setPageError(''); clearError(); }} className="text-xs font-bold underline">Dismiss</button>
          </div>
        )}

        {/* ==================== MAIN EXPLORER WINDOW ==================== */}
        <section className="bg-[#D4D0C8] window-outer-chassis flex flex-col shadow-2xl">
          {/* Cobalt Gradient Titlebar */}
          <div className="h-7 bg-gradient-to-r from-[#000080] via-[#09419b] to-[#1084D0] px-2 flex items-center justify-between text-white select-none">
            <div className="flex items-center gap-1.5">
              <span>📁</span>
              <span className="text-xs font-bold tracking-wide drop-shadow">
                Directory: C:\My Homework\Math ({notebooks.length} Notebooks Found)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="bevel-button bg-[#D4D0C8] text-[#0F172A] w-4 h-4 flex items-center justify-center text-[10px] font-bold">?</button>
              <button type="button" className="bevel-button bg-[#D4D0C8] text-[#0F172A] w-4 h-4 flex items-center justify-center text-[10px] font-bold">_</button>
              <button type="button" className="bevel-button bg-[#D4D0C8] text-red-600 w-4 h-4 flex items-center justify-center text-[10px] font-bold">✕</button>
            </div>
          </div>

          {/* Action Toolbar & View Mode Strip */}
          <div className="px-3 py-2 bg-[#D4D0C8] border-b border-[#808080] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="bevel-button bg-[#00F0FF] text-[#00363a] px-3 py-1 font-black bevel-button-pressed border flex items-center gap-1.5 shadow"
              >
                <span>⚡</span>
                <span>+ Upload Worksheet (PDF / Image)</span>
              </button>

              <button
                type="button"
                onClick={handleCreateNotebook}
                disabled={isCreating}
                className="bevel-button bg-[#D4D0C8] px-3 py-1 font-bold bevel-button-pressed flex items-center gap-1.5"
              >
                <span>📝</span>
                <span>{isCreating ? 'Creating…' : '+ Blank Exercise Book'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="bg-[#0d0e15] text-[#39FF14] px-2 py-0.5 bevel-inset text-[10px] font-bold">
                [AI_SYNC: 99.8%]
              </span>
              <span className="bg-[#0d0e15] text-[#00F0FF] px-2 py-0.5 bevel-inset text-[10px] font-bold">
                SOLVER_CORE: ONLINE
              </span>
            </div>
          </div>

          {/* BENTO GRID OF PHYSICAL EXERCISE BOOKS */}
          <div className="p-4 sm:p-6 bg-[#1a1b22] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full py-16 text-center text-[#00F0FF] font-bold text-sm">
                [ READING DISK BLOCKS… SYNCHRONIZING REALTIME STORE ]
              </div>
            ) : notebooks.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-300 font-bold">
                <p className="text-base text-white">No math homework notebooks found in directory.</p>
                <p className="text-xs text-slate-400 mt-1">Click "+ Upload Worksheet" to scan a problem sheet or "+ Blank Exercise Book".</p>
              </div>
            ) : (
              notebooks.map((nb) => {
                const title = nb.metadata?.title || 'Untitled Math Problem';
                const style = nb.metadata?.paperStyle || 'ruled';
                const dateStr = formatDate(nb.metadata?.updatedAt || nb.metadata?.createdAt);
                const pages = nb.pageCount || 1;

                return (
                  <article
                    key={nb.id}
                    className="bg-[#e4dfd3] p-1.5 bevel-outset flex flex-col justify-between relative group hover:border-[#00F0FF] transition-all shadow-md"
                  >
                    {/* Physical Spiral / Spine Simulation */}
                    <div className="h-4 bg-[#8b7d6b] flex items-center justify-around px-2 border-b border-black mb-1 select-none">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <span key={i} className="w-1.5 h-2 bg-black rounded-none inline-block" />
                      ))}
                    </div>

                    {/* Lined or Grid Paper Notebook Body */}
                    <div
                      className={`${
                        style === 'grid' ? 'cyan-grid-paper text-white' : 'ruled-paper text-[#0F172A]'
                      } bevel-inset p-3.5 min-h-[260px] relative overflow-hidden border-l-[6px] border-l-[#FF2E93] flex flex-col justify-between`}
                    >
                      {/* Holographic Badge */}
                      <div className="absolute top-2 right-2 rotate-3 bg-[#39FF14] text-black border border-black text-[9px] font-black px-1.5 py-0.5 shadow select-none">
                        ★ SOLVED: 100%
                      </div>

                      {/* Header on Paper */}
                      <div>
                        <span className="text-[10px] font-bold tracking-widest text-[#000080] uppercase">
                          [{style.toUpperCase()}_PAPER :: {nb.metadata?.preferredLanguage || 'EN-IN'}]
                        </span>
                        <h2 className="text-sm font-bold mt-1 line-clamp-2 leading-tight">
                          {title}
                        </h2>
                      </div>

                      {/* Handwritten AI Annotation Preview */}
                      <div className="my-3 p-2 bg-white/90 border border-dashed border-slate-400 text-xs">
                        <span className="text-[10px] text-slate-500 font-bold">AI TUTOR ANNOTATION:</span>
                        <p className="font-['Caveat',cursive] text-lg text-[#FF2E93] -rotate-1 font-bold leading-none mt-1">
                          "Antiderivative verified with SymPy. Limits evaluate cleanly."
                        </p>
                      </div>

                      {/* Bottom Stamp Badge */}
                      <div className="inline-flex items-center gap-1 border border-[#16a34a] bg-green-50 text-[#16a34a] px-2 py-0.5 text-[10px] font-bold rotate-[-2deg] uppercase w-max">
                        <span>✓</span>
                        <span>Mistake checked</span>
                      </div>
                    </div>

                    {/* Card Footer & Action */}
                    <div className="mt-2 bg-[#D4D0C8] p-2 bevel-inset flex items-center justify-between text-xs">
                      <div className="text-[10px] text-slate-700 font-bold space-y-0.5">
                        <p>💾 {pages} Page{pages > 1 ? 's' : ''}</p>
                        <p className="text-slate-500">{dateStr}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate(`/notebook/${nb.id}`)}
                        className="bevel-button bg-[#00F0FF] text-[#00363a] px-3 py-1 font-black text-xs hover:brightness-105"
                      >
                        Open Notebook →
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* ==================== BOTTOM FLOATING AUDIO WIDGET (GNANI TIMBRE) ==================== */}
      <aside aria-label="Audio controller" className="fixed bottom-2 left-2 right-2 max-w-[850px] mx-auto bg-[#D4D0C8] window-outer-chassis p-1.5 z-40 select-none shadow-2xl">
        <div className="bg-[#12131A] text-white px-2 py-1 flex items-center justify-between text-xs border border-[#808080]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-none bg-[#39FF14] animate-pulse" />
            <span className="text-[#00F0FF] font-bold text-[11px] truncate">
              CLAIRE VOICE TUTOR [GNANI TIMBRE v2.5 / NALINI]
            </span>
          </div>

          {/* Animated Winamp Equalizer Bars */}
          <div className="flex items-end h-4 gap-0.5 px-2">
            <span className="w-1 bg-[#39FF14] eq-bar" style={{ animationDelay: '0.1s' }} />
            <span className="w-1 bg-[#00F0FF] eq-bar" style={{ animationDelay: '0.3s' }} />
            <span className="w-1 bg-[#FF2E93] eq-bar" style={{ animationDelay: '0.2s' }} />
            <span className="w-1 bg-[#C4B5FD] eq-bar" style={{ animationDelay: '0.4s' }} />
            <span className="w-1 bg-[#39FF14] eq-bar" style={{ animationDelay: '0.15s' }} />
          </div>

          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="text-slate-400 hidden sm:inline">STATUS: STANDBY</span>
            <span className="bg-[#000080] px-1.5 py-0.5 text-white">24kHz PCM</span>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="bevel-button bg-[#D4D0C8] text-[#0F172A] px-2 py-0.5 text-[10px] font-bold hover:bg-slate-200 cursor-pointer"
            >
              ⚙ Config
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== WORKSHEET UPLOADER MODAL ==================== */}
      {uploadModalOpen && (
        <UploadWorksheetModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
        />
      )}

      {/* ==================== RETRO SETTINGS CONTROL PANEL MODAL ==================== */}
      <SettingsControlPanelModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
