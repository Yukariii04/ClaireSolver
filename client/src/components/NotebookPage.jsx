import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { ReactSketchCanvas } from 'react-sketch-canvas';
import { useNotebookStore } from '../store/useNotebookStore.js';

// ---------------------------------------------------------------------------
// Paper background CSS patterns
// ---------------------------------------------------------------------------

const PAPER_BACKGROUNDS = {
  grid: {
    backgroundColor: '#ffffff',
    backgroundImage: [
      'linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)',
    ].join(', '),
    backgroundSize: '24px 24px',
  },
  ruled: {
    backgroundColor: '#ffffff',
    backgroundImage:
      'repeating-linear-gradient(transparent, transparent 23px, rgba(99,102,241,0.10) 23px, rgba(99,102,241,0.10) 24px)',
  },
  blank: {
    backgroundColor: '#ffffff',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NotebookPage = forwardRef(function NotebookPage(
  {
    pageId,
    page,
    paperStyle,
    activeTool,
    strokeColor,
    strokeWidth,
    notebookId,
    isActive,
    onFocus,
  },
  ref,
) {
  const canvasRef = useRef(null);
  const saveTimerRef = useRef(null);
  const initialLoadDone = useRef(false);
  const savePageStrokes = useNotebookStore((s) => s.savePageStrokes);

  // ---- Expose imperative methods to workspace --------------------------
  useImperativeHandle(ref, () => ({
    undo: () => canvasRef.current?.undo(),
    redo: () => canvasRef.current?.redo(),
    exportImage: (type) => canvasRef.current?.exportImage(type),
    exportPaths: () => canvasRef.current?.exportPaths(),
    clearCanvas: () => canvasRef.current?.clearCanvas(),
  }));

  // ---- Load saved strokes on first render ------------------------------
  useEffect(() => {
    if (initialLoadDone.current) return;
    const timer = setTimeout(() => {
      try {
        const paths = JSON.parse(page.userStrokes || '[]');
        if (paths.length > 0 && canvasRef.current) {
          canvasRef.current.loadPaths(paths);
        }
      } catch {
        /* corrupted data — start fresh */
      }
      initialLoadDone.current = true;
    }, 120);
    return () => clearTimeout(timer);
    // Only run once at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Erase mode toggle -----------------------------------------------
  useEffect(() => {
    canvasRef.current?.eraseMode(activeTool === 'eraser');
  }, [activeTool]);

  // ---- Debounced auto-save on stroke end -------------------------------
  const handleStrokeEnd = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const paths = await canvasRef.current?.exportPaths();
        if (paths) await savePageStrokes(notebookId, pageId, paths);
      } catch (err) {
        console.error(`[auto-save ${pageId}]`, err);
      }
    }, 800);
  }, [notebookId, pageId, savePageStrokes]);

  // Clean up timer on unmount
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  // ---- Derived drawing properties --------------------------------------
  const paperBg = PAPER_BACKGROUNDS[paperStyle] || PAPER_BACKGROUNDS.grid;

  const effectiveColor =
    activeTool === 'marker' ? 'rgba(251, 191, 36, 0.35)' : strokeColor;
  const effectiveWidth = activeTool === 'marker' ? 24 : strokeWidth;

  // ---- Render ----------------------------------------------------------
  return (
    <div
      data-notebook-page
      data-page-id={pageId}
      onClick={() => onFocus?.(pageId)}
      className={[
        'relative mx-auto flex w-full max-w-[800px] flex-col overflow-hidden rounded-2xl border bg-white shadow-xl transition-shadow',
        isActive
          ? 'border-indigo-300 shadow-indigo-100/60 ring-2 ring-indigo-200/50'
          : 'border-slate-200',
      ].join(' ')}
      style={{ aspectRatio: '210 / 297' }}
    >
      {/* ── Pinned Question Header ─────────────────────────────────── */}
      {page.questionImageUrl && (
        <div
          className="shrink-0 border-b-2 border-indigo-100 bg-gradient-to-b from-white to-slate-50/80 px-5 py-4"
          style={{ maxHeight: '30%', overflow: 'hidden' }}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
              Q{page.pageNumberLabel.replace(/\D/g, '') || ''}
            </span>
            {page.questionSummary && (
              <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
                {page.questionSummary}
              </p>
            )}
          </div>
          <img
            src={page.questionImageUrl}
            alt={page.questionSummary || `Question on ${page.pageNumberLabel}`}
            crossOrigin="anonymous"
            className="mt-3 max-h-[calc(100%-2.5rem)] w-full object-contain"
            draggable={false}
          />
        </div>
      )}

      {/* ── Drawing Canvas ─────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0" style={paperBg}>
          <ReactSketchCanvas
            ref={canvasRef}
            width="100%"
            height="100%"
            style={{ border: 'none', borderRadius: 0 }}
            canvasColor="transparent"
            strokeColor={effectiveColor}
            strokeWidth={effectiveWidth}
            eraserWidth={Math.max(effectiveWidth * 3, 16)}
            onStroke={handleStrokeEnd}
            allowOnlyPointerType="all"
          />
        </div>
      </div>

      {/* ── Page label badge ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute bottom-2 right-3 select-none rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-400 shadow-sm backdrop-blur">
        {page.pageNumberLabel}
      </div>
    </div>
  );
});

export default NotebookPage;

