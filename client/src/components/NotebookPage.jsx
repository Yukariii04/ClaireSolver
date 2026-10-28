import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { ReactSketchCanvas } from 'react-sketch-canvas';
import { useNotebookStore } from '../store/useNotebookStore.js';
import { computeHeaderBoundingBox, computeStrokeBoundingBox } from '../lib/boundingBox.js';

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
    activeSelection,
    onMarkerSelection,
  },
  ref,
) {
  const pageRef = useRef(null);
  const headerRef = useRef(null);
  const canvasContainerRef = useRef(null);
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
  }, [page.userStrokes]);

  // ---- Erase mode toggle -----------------------------------------------
  useEffect(() => {
    canvasRef.current?.eraseMode(activeTool === 'eraser');
  }, [activeTool]);

  // ---- Stroke completion: Marker harvest vs Ink auto-save -------------
  const handleStrokeEnd = useCallback(async () => {
    if (activeTool === 'marker') {
      try {
        const paths = await canvasRef.current?.exportPaths();
        if (paths && paths.length > 0) {
          const latestPath = paths[paths.length - 1];
          // Remove the temporary highlighter stroke so canvas stays clean
          await canvasRef.current?.undo();

          const container = canvasContainerRef.current;
          const bounds = container
            ? { width: container.clientWidth, height: container.clientHeight }
            : { width: 0, height: 0 };

          const box = computeStrokeBoundingBox(latestPath.paths, {
            bounds,
            paddingRatio: 0.20,
            minSize: 36,
          });

          if (box && container) {
            const containerRect = container.getBoundingClientRect();
            // Calculate screen position for the popover
            const screenPosition = {
              top: Math.min(
                window.innerHeight - 320,
                Math.max(70, containerRect.top + box.minY - 10)
              ),
              left: Math.min(
                window.innerWidth - 380,
                Math.max(20, containerRect.left + box.maxX + 14)
              ),
            };

            onMarkerSelection?.({
              pageId,
              boundingBox: box,
              screenPosition,
            });
          }
        }
      } catch (err) {
        console.error('[Ask Marker capture error]', err);
      }
      return;
    }

    // Debounced ink auto-save for regular pen and eraser strokes
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const paths = await canvasRef.current?.exportPaths();
        if (paths) await savePageStrokes(notebookId, pageId, paths);
      } catch (err) {
        console.error(`[auto-save ${pageId}]`, err);
      }
    }, 800);
  }, [activeTool, notebookId, onMarkerSelection, pageId, savePageStrokes]);

  // Clean up timer on unmount
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  // ---- Optional Question Header Click with Marker ---------------------
  function handleHeaderClick() {
    if (activeTool !== 'marker') return;
    const headerEl = headerRef.current;
    const pageEl = pageRef.current;
    if (!headerEl || !pageEl) return;

    const headerRect = headerEl.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    const box = computeHeaderBoundingBox(headerRect, pageRect);

    const screenPosition = {
      top: Math.min(window.innerHeight - 320, Math.max(70, headerRect.top + 20)),
      left: Math.min(window.innerWidth - 380, Math.max(20, headerRect.right - 220)),
    };

    onMarkerSelection?.({
      pageId,
      boundingBox: box,
      screenPosition,
    });
  }

  // ---- Derived drawing properties --------------------------------------
  const paperBg = PAPER_BACKGROUNDS[paperStyle] || PAPER_BACKGROUNDS.grid;
  const effectiveColor =
    activeTool === 'marker' ? 'rgba(251, 191, 36, 0.40)' : strokeColor;
  const effectiveWidth = activeTool === 'marker' ? 24 : strokeWidth;

  const isSelected = activeSelection?.pageId === pageId;
  const selectionBox = isSelected ? activeSelection.boundingBox : null;

  // ---- Render ----------------------------------------------------------
  return (
    <div
      ref={pageRef}
      data-notebook-page
      data-page-id={pageId}
      onClick={() => onFocus?.(pageId)}
      className={[
        'relative mx-auto flex w-full max-w-[800px] flex-col overflow-hidden rounded-2xl border bg-white shadow-xl transition-shadow select-none',
        isActive
          ? 'border-indigo-300 shadow-indigo-100/60 ring-2 ring-indigo-200/50'
          : 'border-slate-200',
      ].join(' ')}
      style={{ aspectRatio: '210 / 297' }}
    >
      {/* ── Pinned Question Header ─────────────────────────────────── */}
      {page.questionImageUrl && (
        <div
          ref={headerRef}
          data-question-header
          onClick={handleHeaderClick}
          className={`shrink-0 border-b-2 border-indigo-100 bg-gradient-to-b from-white to-slate-50/80 px-5 py-4 transition ${
            activeTool === 'marker'
              ? 'cursor-pointer hover:bg-amber-50/40'
              : ''
          }`}
          style={{ maxHeight: '30%', overflow: 'hidden' }}
        >
          <div className="flex items-start justify-between gap-2">
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
            {activeTool === 'marker' && (
              <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Click to ask Claire
              </span>
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
      <div
        ref={canvasContainerRef}
        data-canvas-container
        className="relative min-h-0 flex-1"
      >
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

        {/* ── Shimmer Selection Box (Canvas region) ────────────────── */}
        {selectionBox && !selectionBox.isHeader && (
          <div
            className="pointer-events-none absolute z-20 rounded-xl border-2 border-amber-400 bg-amber-300/15 shadow-lg shadow-amber-300/20 backdrop-blur-[0.5px] transition-all duration-200"
            style={{
              top: `${selectionBox.minY}px`,
              left: `${selectionBox.minX}px`,
              width: `${selectionBox.width}px`,
              height: `${selectionBox.height}px`,
            }}
          >
            <div className="absolute -top-3 left-2 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-bold text-white shadow-xs">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />
              <span>Selected for Claire</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Shimmer Selection Box (Header region) ──────────────────── */}
      {selectionBox && selectionBox.isHeader && (
        <div
          className="pointer-events-none absolute z-20 rounded-xl border-2 border-amber-400 bg-amber-300/15 shadow-lg shadow-amber-300/20 backdrop-blur-[0.5px] transition-all duration-200"
          style={{
            top: `${selectionBox.minY}px`,
            left: `${selectionBox.minX}px`,
            width: `${selectionBox.width}px`,
            height: `${selectionBox.height}px`,
          }}
        >
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-bold text-white shadow-xs">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />
            <span>Problem Question Selected</span>
          </div>
        </div>
      )}

      {/* ── Page label badge ───────────────────────────────────────── */}
      <div className="pointer-events-none absolute bottom-2 right-3 select-none rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-400 shadow-sm backdrop-blur">
        {page.pageNumberLabel}
      </div>
    </div>
  );
});

export default NotebookPage;
