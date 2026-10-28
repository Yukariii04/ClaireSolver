import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ref, serverTimestamp, update } from 'firebase/database';
import { auth, database } from '../config/firebase.js';
import { useNotebookStore } from '../store/useNotebookStore.js';
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
    </div>
  );
}
