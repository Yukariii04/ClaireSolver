import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ref, serverTimestamp, update } from 'firebase/database';
import { auth, database } from '../config/firebase.js';
import { useNotebookStore } from '../store/useNotebookStore.js';
import { useStepPlaybackQueue } from '../store/useStepPlaybackQueue.js';
import { PREFERRED_LANGUAGES } from '../lib/notebookSchema.js';
import { harvestCanvasContext } from '../lib/harvestCanvasContext.js';
import NotebookPage from './NotebookPage.jsx';
import FloatingDock from './FloatingDock.jsx';
import MarkerActionPopover from './MarkerActionPopover.jsx';

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
  const [exporting, setExporting] = useState(false);

  // ---- "✨ Ask Marker" Selection & Popover State -------------------------
  const [selectionState, setSelectionState] = useState(null);
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [tutorStatus, setTutorStatus] = useState(null);
  const [askWhyModal, setAskWhyModal] = useState(null);
  const [askWhyQuestion, setAskWhyQuestion] = useState('');

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
    const uid = auth.currentUser?.uid;
    if (!uid || !notebookId) return;
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

  // ---- PDF export -------------------------------------------------------
  async function handleExportPDF() {
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const pageEls = pagesContainerRef.current?.querySelectorAll(
        '[data-notebook-page]',
      );
      if (!pageEls?.length) return;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pageEls.length; i++) {
        if (i > 0) pdf.addPage();
        const canvas = await html2canvas(pageEls[i], {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
        pdf.addImage(
          canvas.toDataURL('image/png'),
          'PNG',
          0,
          0,
          pdfW,
          pdfH,
        );
      }

      const safeName =
        (notebook.metadata?.title || 'notebook')
          .replace(/[^a-zA-Z0-9 _-]/g, '')
          .trim() || 'notebook';
      pdf.save(`${safeName}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }

  // ---- Derived data -----------------------------------------------------
  const metadata = notebook.metadata || {};
  const paperStyle = metadata.paperStyle || 'grid';
  const currentLang = metadata.preferredLanguage || 'en-IN';

  // ---- Render -----------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-[#f3f5fb]">
      {/* ═══════════════════ Top Bar ═══════════════════════════════════ */}
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Left — back + title */}
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/dashboard"
              className="shrink-0 rounded-xl px-2 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              ← Back
            </Link>
            <h1 className="truncate text-sm font-semibold text-slate-800 sm:text-base">
              {metadata.title || 'Untitled Notebook'}
            </h1>
          </div>

          {/* Right — language, mic, export */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Language pills */}
            <div className="hidden items-center gap-0.5 rounded-xl border border-slate-200 bg-white/80 p-0.5 sm:flex">
              {PREFERRED_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => handleLanguageChange(lang)}
                  className={[
                    'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                    currentLang === lang
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  ].join(' ')}
                >
                  {LANGUAGE_LABELS[lang] || lang}
                </button>
              ))}
            </div>

            {/* Mic / voice status indicator */}
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              <span className="hidden sm:inline">Voice off</span>
            </span>

            {/* Export PDF */}
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-indigo-600" />
                  Exporting…
                </>
              ) : (
                'Export PDF'
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Realtime Claire Tutor Status Banner ─────────────────────── */}
      {tutorStatus && (
        <div className="sticky top-[57px] z-25 border-b border-indigo-100 bg-indigo-50/90 px-4 py-2 text-center backdrop-blur-md">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-indigo-900">
            <span className="h-2 w-2 animate-ping rounded-full bg-indigo-600" />
            <span>{tutorStatus.message || 'Claire is solving...'}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/95 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500 text-sm font-bold text-white shadow-xs">
                  💡
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Question on Step {askWhyModal.step?.step_number || ''}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Paused Claire's Ghost Pen solution
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAskWhyModal(null);
                  useStepPlaybackQueue.getState().resumePlayback();
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="my-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              <span className="text-[11px] font-semibold text-indigo-900">
                Formula at this step:
              </span>
              <p className="mt-1 font-mono text-xs text-indigo-800 line-clamp-2">
                {askWhyModal.step?.canvas_latex || 'Derivation step'}
              </p>
              {askWhyModal.step?.margin_note && (
                <p className="mt-1 text-[11px] font-medium text-amber-700 font-['Caveat',cursive]">
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
              className="mt-3"
            >
              <label className="block text-[11px] font-semibold text-slate-700">
                What would you like Claire to explain?
              </label>
              <input
                type="text"
                autoFocus
                value={askWhyQuestion}
                onChange={(e) => setAskWhyQuestion(e.target.value)}
                placeholder="e.g. Why did we integrate by parts here?"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAskWhyModal(null);
                    useStepPlaybackQueue.getState().resumePlayback();
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  ▶ Resume Solution
                </button>
                <button
                  type="submit"
                  disabled={!askWhyQuestion.trim()}
                  className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  Ask Claire
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
