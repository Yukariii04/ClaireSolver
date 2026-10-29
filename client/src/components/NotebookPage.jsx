import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ReactSketchCanvas } from 'react-sketch-canvas';
import { useNotebookStore } from '../store/useNotebookStore.js';
import { computeHeaderBoundingBox, computeStrokeBoundingBox } from '../lib/boundingBox.js';
import GhostPenStep from './GhostPenStep.jsx';
import StudentHandwritingLine from './StudentHandwritingLine.jsx';
import { useStepPlaybackQueue } from '../store/useStepPlaybackQueue.js';

// ---------------------------------------------------------------------------
// Paper background CSS patterns (Real Physical Notebook Alignment)
// ---------------------------------------------------------------------------

const PAPER_BACKGROUNDS = {
  grid: {
    backgroundColor: '#FDFDFE',
    backgroundImage: [
      'linear-gradient(rgba(0, 240, 255, 0.25) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(0, 240, 255, 0.25) 1px, transparent 1px)',
      'linear-gradient(90deg, transparent 71px, rgba(244, 63, 94, 0.5) 71px, rgba(244, 63, 94, 0.5) 73px, transparent 73px)',
    ].join(', '),
    backgroundSize: '24px 24px, 24px 24px, 100% 100%',
  },
  ruled: {
    backgroundColor: '#FDFDFE',
    backgroundImage: [
      'linear-gradient(#b9d5f0 1px, transparent 1px)',
      'linear-gradient(90deg, transparent 71px, rgba(244, 63, 94, 0.5) 71px, rgba(244, 63, 94, 0.5) 73px, transparent 73px)',
    ].join(', '),
    backgroundSize: '100% 32px, 100% 100%',
    lineHeight: '32px',
  },
  blank: {
    backgroundColor: '#FDFDFE',
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
  const strokeSaveTimerRef = useRef(null);
  const lineSaveTimerRef = useRef(null);
  const initialLoadDone = useRef(false);

  const savePageStrokes = useNotebookStore((s) => s.savePageStrokes);
  const savePageStudentLines = useNotebookStore((s) => s.savePageStudentLines);

  // ---- Student Handwritten Lines State ---------------------------------
  const [studentLines, setStudentLines] = useState(() => page.studentLines || []);
  const [editingLineId, setEditingLineId] = useState(null);

  useEffect(() => {
    if (Array.isArray(page.studentLines)) {
      setStudentLines(page.studentLines);
    }
  }, [page.studentLines]);

  const triggerSaveStudentLines = useCallback(
    (newLines) => {
      if (lineSaveTimerRef.current) clearTimeout(lineSaveTimerRef.current);
      lineSaveTimerRef.current = setTimeout(async () => {
        try {
          await savePageStudentLines(notebookId, pageId, newLines);
        } catch (err) {
          console.error(`[auto-save student lines ${pageId}]`, err);
        }
      }, 600);
    },
    [notebookId, pageId, savePageStudentLines],
  );

  function handleUpdateLineText(idx, newText) {
    setStudentLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], text: newText };
      triggerSaveStudentLines(next);
      return next;
    });
  }

  function handleUpdateLineMargin(idx, newMargin) {
    setStudentLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], marginLabel: newMargin };
      triggerSaveStudentLines(next);
      return next;
    });
  }

  function handleAddLineAfter(idx) {
    const newLineId = `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newLine = { id: newLineId, text: '', marginLabel: '' };
    setStudentLines((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, newLine);
      triggerSaveStudentLines(next);
      return next;
    });
    setEditingLineId(newLineId);
  }

  function handleDeleteLine(idx) {
    setStudentLines((prev) => {
      if (prev.length <= 1) {
        const cleared = [{ id: prev[0]?.id || 'line_0', text: '', marginLabel: '' }];
        triggerSaveStudentLines(cleared);
        return cleared;
      }
      const prevLineId = idx > 0 ? prev[idx - 1]?.id : null;
      const next = prev.filter((_, i) => i !== idx);
      triggerSaveStudentLines(next);
      if (prevLineId) setEditingLineId(prevLineId);
      return next;
    });
  }

  function handleAddNewLine() {
    const newLineId = `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newLine = { id: newLineId, text: '', marginLabel: '' };
    setStudentLines((prev) => {
      const next = [...prev, newLine];
      triggerSaveStudentLines(next);
      return next;
    });
    setEditingLineId(newLineId);
  }

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
            const screenPosition = {
              top: Math.min(
                window.innerHeight - 320,
                Math.max(70, containerRect.top + box.minY - 10),
              ),
              left: Math.min(
                window.innerWidth - 380,
                Math.max(20, containerRect.left + box.maxX + 14),
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
    if (strokeSaveTimerRef.current) clearTimeout(strokeSaveTimerRef.current);
    strokeSaveTimerRef.current = setTimeout(async () => {
      try {
        const paths = await canvasRef.current?.exportPaths();
        if (paths) await savePageStrokes(notebookId, pageId, paths);
      } catch (err) {
        console.error(`[auto-save ${pageId}]`, err);
      }
    }, 800);
  }, [activeTool, notebookId, onMarkerSelection, pageId, savePageStrokes]);

  useEffect(
    () => () => {
      if (strokeSaveTimerRef.current) clearTimeout(strokeSaveTimerRef.current);
      if (lineSaveTimerRef.current) clearTimeout(lineSaveTimerRef.current);
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
  const paperBg = PAPER_BACKGROUNDS[paperStyle] || PAPER_BACKGROUNDS.ruled;
  const effectiveColor =
    activeTool === 'marker' ? 'rgba(251, 191, 36, 0.40)' : strokeColor;
  const effectiveWidth = activeTool === 'marker' ? 24 : strokeWidth;

  const isSelected = activeSelection?.pageId === pageId;
  const selectionBox = isSelected ? activeSelection.boundingBox : null;

  // ---- Step Playback Queue Subscription --------------------------------
  const queueSteps = useStepPlaybackQueue((s) => s.stepsQueue);
  const queuePageId = useStepPlaybackQueue((s) => s.activePageId);
  const currentStepIndex = useStepPlaybackQueue((s) => s.currentStepIndex);
  const stepStatusMap = useStepPlaybackQueue((s) => s.stepStatusMap);
  const isWritingStep = useStepPlaybackQueue((s) => s.isWritingStep);
  const activeMistakeNote = useStepPlaybackQueue((s) => s.mistakeNote);

  const isCurrentPageQueue = queuePageId === pageId && queueSteps.length > 0;
  const stepsToRender = isCurrentPageQueue
    ? queueSteps
    : Array.isArray(page.aiSteps)
      ? page.aiSteps
      : [];
  const mistakeNote = isCurrentPageQueue ? activeMistakeNote : null;

  // ---- Render ----------------------------------------------------------
  return (
    <div
      ref={pageRef}
      data-notebook-page
      data-page-id={pageId}
      onClick={() => onFocus?.(pageId)}
      className={[
        'relative mx-auto flex w-full max-w-[840px] flex-col overflow-y-auto bg-white window-outer-chassis shadow-2xl transition-all select-none border-l-[8px] border-l-[#FF2E93]',
        isActive
          ? 'ring-2 ring-[#00F0FF]'
          : 'opacity-95',
      ].join(' ')}
      style={{ minHeight: '1130px', aspectRatio: '210 / 297' }}
    >
      {/* Binder Perforation Holes Simulation */}
      <div className="absolute left-1 top-8 w-2 h-2 rounded-full bg-[#0d0e15] border border-[#808080] pointer-events-none z-20" />
      <div className="absolute left-1 top-28 w-2 h-2 rounded-full bg-[#0d0e15] border border-[#808080] pointer-events-none z-20" />
      <div className="absolute left-1 bottom-12 w-2 h-2 rounded-full bg-[#0d0e15] border border-[#808080] pointer-events-none z-20" />

      {/* ── Pinned Question Header ─────────────────────────────────── */}
      {page.questionImageUrl && (
        <div
          ref={headerRef}
          data-question-header
          onClick={handleHeaderClick}
          className={`shrink-0 border-b-2 border-[#808080] bg-[#FFFBEB] px-5 py-3 transition shadow-xs ${
            activeTool === 'marker'
              ? 'cursor-pointer hover:bg-yellow-100'
              : ''
          }`}
          style={{ maxHeight: '30%', overflow: 'hidden' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span className="shrink-0 bg-[#000080] text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bevel-raised">
                [Q{page.pageNumberLabel.replace(/\D/g, '') || '1'} :: PROBLEM]
              </span>
              {page.questionSummary && (
                <p className="line-clamp-2 text-xs font-mono font-bold text-slate-800">
                  {page.questionSummary}
                </p>
              )}
            </div>
            {activeTool === 'marker' && (
              <span className="shrink-0 border border-black bg-[#39FF14] text-black px-1.5 py-0.5 text-[9px] font-black uppercase shadow-xs">
                ★ Click to Ask Claire
              </span>
            )}
          </div>
          <img
            src={page.questionImageUrl}
            alt={page.questionSummary || `Question on ${page.pageNumberLabel}`}
            crossOrigin="anonymous"
            className="mt-2.5 max-h-[calc(100%-2.5rem)] w-full object-contain bevel-sunken"
            draggable={false}
          />
        </div>
      )}

      {/* ── Ruled Writing & Drawing Surface ───────────────────────── */}
      <div
        ref={canvasContainerRef}
        data-canvas-container
        className="relative min-h-[750px] flex-1 overflow-visible"
        style={paperBg}
      >
        {/* Layer 0: Freehand Drawing Canvas (ReactSketchCanvas) */}
        <div
          className={`absolute inset-0 z-0 ${
            activeTool === 'write' ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
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

        {/* Layer 1: Structured Handwritten Lines (Student Lines + AI Solution Steps) */}
        <div className="relative z-10 w-full pt-1 pb-16">
          {/* Observation Note (if mistake detected) */}
          {mistakeNote && (
            <div className="ml-[76px] mr-4 mb-2 flex items-start gap-2 border-l-4 border-amber-400 bg-amber-50/90 p-2 text-xs font-mono text-amber-900 shadow-xs backdrop-blur-xs select-none">
              <span className="text-base leading-none">🔍</span>
              <div>
                <span className="font-bold">Claire's Observation: </span>
                <span className="font-sans font-medium">{mistakeNote}</span>
              </div>
            </div>
          )}

          {/* Student Handwritten Lines */}
          {studentLines.map((line, idx) => (
            <StudentHandwritingLine
              key={line.id || `student-line-${idx}`}
              line={line}
              isEditing={editingLineId === (line.id || `student-line-${idx}`)}
              onStartEdit={() => setEditingLineId(line.id || `student-line-${idx}`)}
              onChangeText={(txt) => handleUpdateLineText(idx, txt)}
              onChangeMargin={(lbl) => handleUpdateLineMargin(idx, lbl)}
              onEnter={() => handleAddLineAfter(idx)}
              onBackspaceEmpty={() => handleDeleteLine(idx)}
              onBlur={() => setEditingLineId(null)}
              isWriteToolActive={activeTool === 'write'}
            />
          ))}

          {/* Quick Line Adder when in Write tool mode */}
          {activeTool === 'write' && (
            <div className="w-full flex items-center my-0 select-none pl-[76px]">
              <button
                type="button"
                onClick={handleAddNewLine}
                className="text-left handwriting-ink-student text-xl text-slate-400 hover:text-[#000080] py-0.5 cursor-pointer transition-colors"
              >
                ✎ + Click to write next line...
              </button>
            </div>
          )}

          {/* AI Ghost Pen Derivation Steps */}
          {stepsToRender.map((stepItem, idx) => {
            const num = stepItem.step_number || idx + 1;
            const stepStatus = isCurrentPageQueue
              ? stepStatusMap[num] ||
                (idx < currentStepIndex
                  ? 'completed'
                  : idx === currentStepIndex
                    ? 'writing'
                    : 'pending')
              : 'completed';
            const isStepActive =
              isCurrentPageQueue && idx === currentStepIndex && isWritingStep;

            return (
              <GhostPenStep
                key={`ghost-step-${num}-${idx}`}
                step={stepItem}
                status={stepStatus}
                isActive={isStepActive}
              />
            );
          })}
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
