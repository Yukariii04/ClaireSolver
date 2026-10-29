import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ref, serverTimestamp, update } from 'firebase/database';
import { auth, database } from '../config/firebase.js';
import { useNotebookStore } from '../store/useNotebookStore.js';
import { useStepPlaybackQueue } from '../store/useStepPlaybackQueue.js';
import { PREFERRED_LANGUAGES } from '../lib/notebookSchema.js';
import { harvestCanvasContext } from '../lib/harvestCanvasContext.js';
import { useVoiceTutor } from '../hooks/useVoiceTutor.js';
import NotebookPage from './NotebookPage.jsx';
import FloatingDock from './FloatingDock.jsx';
import MarkerActionPopover from './MarkerActionPopover.jsx';
import ExportPdfModal from './ExportPdfModal.jsx';
import SettingsControlPanelModal from './SettingsControlPanelModal.jsx';

// ---------------------------------------------------------------------------
// Language labels
// ---------------------------------------------------------------------------

const LANGUAGE_LABELS = {
  'en-IN': 'English',
  'hi-IN': 'Hindi',
  'gu-IN': 'ગુજરાતી',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotebookWorkspace({ notebook, notebookId }) {
  // ---- Store actions ----------------------------------------------------
  const insertContinuationPage = useNotebookStore((s) => s.insertContinuationPage);

  // ---- Tool state -------------------------------------------------------
  const [activeTool, setActiveTool] = useState('pen');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const strokeColor = '#1a1a2e'; // dark blue-black ink

  // ---- Active page tracking ---------------------------------------------
  const [activePageId, setActivePageId] = useState(
    () => notebook.pageOrder[0] || null,
  );
  const [extending, setExtending] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // ---- "✨ Ask Marker" Selection & Popover State -------------------------
  const [selectionState, setSelectionState] = useState(null);
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [tutorStatus, setTutorStatus] = useState(null);
  const [askWhyModal, setAskWhyModal] = useState(null);
  const [askWhyQuestion, setAskWhyQuestion] = useState('');

  // ---- Hands-Free Voice & System 1 Gatekeeper Hook ---------------------
  const {
    isListening,
    isMuted,
    transcript: voiceTranscript,
    gatekeeperState,
    startListening,
    stopListening,
    toggleMute,
  } = useVoiceTutor({
    activePageId,
    notebookId,
    preferredLanguage: notebook.metadata?.preferredLanguage || 'en-IN',
  });

  // ---- Canvas refs (one per page) ---------------------------------------
  const canvasRefs = useRef({});
  const pagesContainerRef = useRef(null);

  const setCanvasRef = useCallback(
    (pageId) => (el) => {
      if (el) canvasRefs.current[pageId] = el;
      else delete canvasRefs.current[pageId];
    },
    [],
  );

  // ---- Undo / Redo on active page ---------------------------------------
  function handleUndo() {
    if (activePageId) canvasRefs.current[activePageId]?.undo();
  }
  function handleRedo() {
    if (activePageId) canvasRefs.current[activePageId]?.redo();
  }

  // ---- Extend page (insert continuation) --------------------------------
  async function handleExtendPage() {
    if (!activePageId || extending) return;
    setExtending(true);
    try {
      const newPageId = await insertContinuationPage(notebookId, activePageId);
      setTimeout(() => {
        document
          .querySelector(`[data-page-id="${newPageId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setActivePageId(newPageId);
      }, 200);
    } catch (err) {
      console.error('Failed to extend page:', err);
    } finally {
      setExtending(false);
    }
  }

  // ---- Marker Selection Triggered from NotebookPage ---------------------
  function handleMarkerSelection(selection) {
    setActivePageId(selection.pageId);
    setSelectionState(selection);
  }

  function handleDismissSelection() {
    setSelectionState(null);
    setIsHarvesting(false);
  }

  // ---- Execute Marker Action & Harvest Canvas Context ------------------
  async function handleExecuteAction({ action, query }) {
    if (!selectionState) return;

    setIsHarvesting(true);
    try {
      // Harvest the full page snapshot + high-res target crop
      const harvestedContext = await harvestCanvasContext(
        selectionState.pageId,
        selectionState.boundingBox
      );

      // Dispatch global summon event for Step 6 WebSocket Tutor
      window.dispatchEvent(
        new CustomEvent('claire:summon', {
          detail: {
            action,
            query,
            pageId: selectionState.pageId,
            notebookId,
            boundingBox: selectionState.boundingBox,
            fullPageBase64: harvestedContext.fullPageBase64,
            croppedTargetBase64: harvestedContext.croppedTargetBase64,
            preferredLanguage: notebook.metadata?.preferredLanguage || 'en-IN',
          },
        })
      );

      // Auto-switch tool back to pen for seamless writing workflow
      setActiveTool('pen');
      setSelectionState(null);
    } catch (err) {
      console.error('[Failed to harvest context for Claire]', err);
    } finally {
      setIsHarvesting(false);
    }
  }

  // ---- Streaming AI Tutor WebSocket / HTTP Receiver --------------------
  useEffect(() => {
    async function handleSummon(event) {
      const detail = event.detail;
      if (!detail) return;

      setTutorStatus({
        status: 'analyzing',
        message: 'Claire is reading handwriting & verifying math with SymPy...',
      });

      const wsUrl = import.meta.env.VITE_AI_WS_URL || 'ws://localhost:8000/ws/tutor';
      const httpFallbackUrl = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000/solve';

      let wsResolved = false;
      const accumulatedSteps = [];

      function triggerHttpFallback() {
        if (wsResolved) return;
        wsResolved = true;

        fetch(httpFallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: detail.action || 'solve',
            query: detail.query || '',
            cropped_target_base64: detail.croppedTargetBase64 || '',
            full_page_base64: detail.fullPageBase64 || '',
            preferred_language: detail.preferredLanguage || 'en-IN',
          }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP solve error: ${res.status}`);
            return res.json();
          })
          .then((solution) => {
            if (solution.student_mistake_note) {
              useStepPlaybackQueue.getState().setMistakeNote(solution.student_mistake_note);
            }
            setTutorStatus(null);
            useStepPlaybackQueue.getState().startPlayback(solution.steps || [], {
              pageId: detail.pageId,
              notebookId: detail.notebookId,
              language: detail.preferredLanguage,
            });
          })
          .catch((err) => {
            console.error('[HTTP solve fallback failed]', err);
            setTutorStatus({ status: 'error', message: 'Could not connect to Claire AI engine.' });
            setTimeout(() => setTutorStatus(null), 4000);
          });
      }

      try {
        const socket = new WebSocket(wsUrl);

        const timeoutId = setTimeout(() => {
          if (!wsResolved) {
            console.warn('[Tutor WS timed out, switching to HTTP fallback]');
            try { socket.close(); } catch {}
            triggerHttpFallback();
          }
        }, 6000);

        socket.onopen = () => {
          socket.send(
            JSON.stringify({
              type: 'solve_request',
              action: detail.action || 'solve',
              query: detail.query || '',
              pageId: detail.pageId,
              notebookId: detail.notebookId,
              preferredLanguage: detail.preferredLanguage || 'en-IN',
              croppedTargetBase64: detail.croppedTargetBase64 || '',
              fullPageBase64: detail.fullPageBase64 || '',
            }),
          );
        };

        socket.onmessage = (msgEvent) => {
          try {
            const data = JSON.parse(msgEvent.data);
            if (data.type === 'ready') return;

            if (data.type === 'status') {
              setTutorStatus({ status: data.status, message: data.message });
            } else if (data.type === 'problem_detected') {
              if (data.student_mistake_note) {
                useStepPlaybackQueue.getState().setMistakeNote(data.student_mistake_note);
              }
            } else if (data.type === 'step') {
              accumulatedSteps.push(data.step);
            } else if (data.type === 'complete') {
              wsResolved = true;
              clearTimeout(timeoutId);
              setTutorStatus(null);
              const allSteps =
                data.solution?.steps?.length > 0 ? data.solution.steps : accumulatedSteps;
              useStepPlaybackQueue.getState().startPlayback(allSteps, {
                pageId: detail.pageId,
                notebookId: detail.notebookId,
                language: detail.preferredLanguage,
              });
              try { socket.close(); } catch {}
            } else if (data.type === 'error') {
              wsResolved = true;
              clearTimeout(timeoutId);
              setTutorStatus({ status: 'error', message: data.error });
              setTimeout(() => setTutorStatus(null), 4000);
            }
          } catch (err) {
            console.error('[WebSocket message parse error]', err);
          }
        };

        socket.onerror = () => {
          clearTimeout(timeoutId);
          triggerHttpFallback();
        };
      } catch (err) {
        triggerHttpFallback();
      }
    }

    function handleAskWhy(event) {
      setAskWhyModal(event.detail);
      setAskWhyQuestion('');
    }

    window.addEventListener('claire:summon', handleSummon);
    window.addEventListener('claire:ask_why', handleAskWhy);

    return () => {
      window.removeEventListener('claire:summon', handleSummon);
      window.removeEventListener('claire:ask_why', handleAskWhy);
    };
  }, []);

  // ---- Language selector ------------------------------------------------
  async function handleLanguageChange(newLang) {
    const uid = auth?.currentUser?.uid || 'demo-student';
    if (!uid || !notebookId) return;
    if (database) {
      try {
        const ts = serverTimestamp();
        await update(ref(database), {
          [`notebooks/${uid}/${notebookId}/metadata/preferredLanguage`]: newLang,
          [`notebooks/${uid}/${notebookId}/metadata/updatedAt`]: ts,
          [`notebookIndex/${uid}/${notebookId}/preferredLanguage`]: newLang,
          [`notebookIndex/${uid}/${notebookId}/updatedAt`]: ts,
        });
      } catch (err) {
        console.error('Failed to update language:', err);
      }
    }
  }

  // ---- Derived data -----------------------------------------------------
  const metadata = notebook.metadata || {};
  const paperStyle = metadata.paperStyle || 'grid';
  const currentLang = metadata.preferredLanguage || 'en-IN';

  // ---- Render -----------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-desktop-crt font-mono text-[#0F172A] selection:bg-[#00F0FF] selection:text-[#0F172A]">
      {/* ═══════════════════ Top Retro System Header Bar ═══════════════════════════════════ */}
      <header className="sticky top-0 z-30 bg-[#D4D0C8] border-b-2 border-[#808080] border-t-2 border-l-2 border-white px-2 py-1 select-none shadow">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          {/* Left — back + title */}
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/dashboard"
              className="bevel-button bg-[#D4D0C8] text-[#000080] px-2.5 py-0.5 text-xs font-bold hover:bg-slate-200"
            >
              ← Back to C:\
            </Link>
            <span className="text-xs font-bold text-[#0F172A] truncate drop-shadow-[0.5px_0.5px_0px_#FFFFFF]">
              {metadata.title || 'Untitled Math Problem'}
            </span>
          </div>

          {/* Right — language, mic, export */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Language pills */}
            <div className="hidden sm:flex items-center bevel-inset bg-[#D4D0C8] p-0.5">
              {PREFERRED_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => handleLanguageChange(lang)}
                  className={`px-1.5 py-0.5 text-[10px] font-bold ${
                    currentLang === lang
                      ? 'bg-[#000080] text-white'
                      : 'text-[#0F172A] hover:bg-slate-300'
                  }`}
                >
                  {LANGUAGE_LABELS[lang] || lang}
                </button>
              ))}
            </div>

            {/* Mic / voice status indicator */}
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              title={isListening ? 'Click to disable hands-free voice' : 'Click to enable hands-free voice'}
              className="bevel-button bg-[#D4D0C8] px-2.5 py-0.5 text-[11px] font-bold flex items-center gap-1.5 hover:bg-slate-200"
            >
              <span
                className={`h-2 w-2 rounded-none border border-black ${
                  isListening
                    ? gatekeeperState === 'evaluating'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-[#39FF14] animate-pulse'
                    : 'bg-slate-400'
                }`}
              />
              <span className="hidden sm:inline">
                {isListening
                  ? gatekeeperState === 'evaluating'
                    ? 'Laya evaluating...'
                    : gatekeeperState === 'summoned'
                      ? 'Summoned!'
                      : gatekeeperState === 'ignored'
                        ? 'Thinking aloud'
                        : 'Voice on (Prisma)'
                  : 'Voice off'}
              </span>
              <span className="sm:hidden">{isListening ? '🎙️' : '🔇'}</span>
            </button>

            {/* Export PDF */}
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="bevel-button bg-[#00F0FF] text-[#00363a] px-3 py-0.5 text-xs font-black bevel-button-pressed border hover:brightness-105 flex items-center gap-1"
            >
              <span>🖨️</span>
              <span>Export PDF</span>
            </button>

            {/* AI Tutor & Voice Settings */}
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="bevel-button bg-[#D4D0C8] text-[#0F172A] px-2 py-0.5 text-xs font-bold hover:bg-slate-200 flex items-center gap-1"
              title="Configure Voice, AI Model, and Inks"
            >
              <span>⚙️</span>
              <span className="hidden md:inline">Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Realtime Claire Tutor Status Banner ─────────────────────── */}
      {tutorStatus && (
        <div className="sticky top-[38px] z-25 bg-[#0d0e15] border-b-2 border-[#00F0FF] px-4 py-1.5 text-center shadow-lg">
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#00F0FF] font-mono">
            <span className="h-2 w-2 animate-ping bg-[#39FF14]" />
            <span>[AI_SOLVER_ENGINE]: {tutorStatus.message || 'Claire is solving...'}</span>
          </div>
        </div>
      )}

      {/* ═══════════════════ Page Stack ═════════════════════════════════ */}
      <div
        ref={pagesContainerRef}
        className="flex-1 space-y-8 overflow-y-auto px-4 pb-28 pt-8 sm:px-6"
      >
        {notebook.pageOrder.map((pageId) => {
          const page = notebook.pages[pageId];
          if (!page) return null;
          return (
            <NotebookPage
              key={pageId}
              ref={setCanvasRef(pageId)}
              pageId={pageId}
              page={page}
              paperStyle={paperStyle}
              activeTool={activeTool}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
              notebookId={notebookId}
              isActive={activePageId === pageId}
              onFocus={setActivePageId}
              activeSelection={selectionState}
              onMarkerSelection={handleMarkerSelection}
            />
          );
        })}
      </div>

      {/* ═══════════════════ Floating Dock ══════════════════════════════ */}
      <FloatingDock
        activeTool={activeTool}
        strokeWidth={strokeWidth}
        onToolChange={(tool) => {
          setActiveTool(tool);
          if (tool !== 'marker') {
            setSelectionState(null);
          }
        }}
        onStrokeWidthChange={setStrokeWidth}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExtendPage={handleExtendPage}
        canExtend={!!activePageId}
        extending={extending}
      />

      {/* ═══════════════════ Marker Action Popover ══════════════════════ */}
      {selectionState && (
        <MarkerActionPopover
          position={selectionState.screenPosition}
          isHarvesting={isHarvesting}
          onAction={handleExecuteAction}
          onClose={handleDismissSelection}
        />
      )}

      {/* ═══════════════════ [⏸ Ask Why] Interruption Modal ═══════════ */}
      {askWhyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs select-none">
          <div className="w-full max-w-md bg-[#D4D0C8] window-outer-chassis p-1 shadow-2xl">
            {/* Titlebar */}
            <div className="h-7 bg-gradient-to-r from-[#000080] via-[#09419b] to-[#1084D0] px-2 flex items-center justify-between text-white">
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <span>💡</span>
                <span>Question on Step {askWhyModal.step?.step_number || ''} [Paused Solution]</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAskWhyModal(null);
                  useStepPlaybackQueue.getState().resumePlayback();
                }}
                className="bevel-button bg-[#D4D0C8] text-red-700 w-4 h-4 flex items-center justify-center font-bold text-[10px]"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-[#D4D0C8] space-y-2.5 text-xs text-[#0F172A]">
              <div className="bevel-inset bg-[#0d0e15] p-2.5 text-[#00F0FF]">
                <span className="text-[10px] text-slate-400 font-bold block mb-1">
                  &gt; FORMULA AT CURRENT STEP:
                </span>
                <p className="font-mono text-xs text-[#00F0FF] line-clamp-2">
                  {askWhyModal.step?.canvas_latex || 'Derivation step'}
                </p>
                {askWhyModal.step?.margin_note && (
                  <p className="mt-1 text-xs font-bold text-[#FF2E93] font-['Caveat',cursive]">
                    ✎ {askWhyModal.step.margin_note}
                  </p>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (askWhyQuestion.trim()) {
                    window.dispatchEvent(
                      new CustomEvent('claire:summon', {
                        detail: {
                          action: 'hint',
                          query: `Clarify step ${askWhyModal.step?.step_number}: ${askWhyQuestion}`,
                          pageId: askWhyModal.pageId,
                          notebookId: askWhyModal.notebookId,
                          preferredLanguage: currentLang,
                        },
                      }),
                    );
                  }
                  setAskWhyModal(null);
                }}
                className="space-y-2"
              >
                <label className="block text-xs font-bold">
                  What would you like Claire to explain?
                </label>
                <input
                  type="text"
                  autoFocus
                  value={askWhyQuestion}
                  onChange={(e) => setAskWhyQuestion(e.target.value)}
                  placeholder="e.g. Why did we integrate by parts here?"
                  className="w-full bg-white text-[#0F172A] px-2.5 py-1.5 bevel-sunken-field focus:outline-none focus:ring-1 focus:ring-[#00F0FF] text-xs font-mono"
                />
                <div className="pt-2 border-t border-[#808080] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAskWhyModal(null);
                      useStepPlaybackQueue.getState().resumePlayback();
                    }}
                    className="bevel-button bg-[#D4D0C8] px-3 py-1 font-bold text-xs hover:bg-slate-200"
                  >
                    ▶ Resume Solution
                  </button>
                  <button
                    type="submit"
                    disabled={!askWhyQuestion.trim()}
                    className="bevel-button bg-[#00F0FF] text-[#00363a] px-3 py-1 font-black text-xs bevel-button-pressed border hover:brightness-105 disabled:opacity-50"
                  >
                    Ask Claire →
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* ═══════════════════ Export PDF Modal ══════════════════════════ */}
      <ExportPdfModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        notebookTitle={notebook.metadata?.title || 'Homework Notebook'}
        pageElements={Array.from(
          pagesContainerRef.current?.querySelectorAll('[data-notebook-page]') || [],
        )}
      />

      {/* ═══════════════════ AI Tutor & Voice Settings Modal ══════════ */}
      <SettingsControlPanelModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </div>
  );
}
