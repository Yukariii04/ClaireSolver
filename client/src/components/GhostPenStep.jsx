import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import InlineNotebookGraph from './InlineNotebookGraph.jsx';
import { useStepPlaybackQueue } from '../store/useStepPlaybackQueue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderKaTeX(latexStr) {
  if (!latexStr || typeof latexStr !== 'string') return '';
  try {
    return katex.renderToString(latexStr, {
      displayMode: true,
      throwOnError: false,
      output: 'htmlAndMathml',
    });
  } catch (err) {
    console.warn('[KaTeX render error]', err);
    return `<span class="text-rose-600 font-mono text-xs">${latexStr}</span>`;
  }
}

// ---------------------------------------------------------------------------
// Component: GhostPenStep
// ---------------------------------------------------------------------------

export default function GhostPenStep({
  step,
  status = 'pending', // 'pending' | 'writing' | 'completed'
  isActive = false,
}) {
  const completeStepWriting = useStepPlaybackQueue((s) => s.completeStepWriting);
  const interruptAndAskWhy = useStepPlaybackQueue((s) => s.interruptAndAskWhy);
  const isPaused = useStepPlaybackQueue((s) => s.isPaused);
  const resumePlayback = useStepPlaybackQueue((s) => s.resumePlayback);

  const [revealProgress, setRevealProgress] = useState(() =>
    status === 'completed' ? 100 : 0,
  );
  const animationFrameRef = useRef(null);
  const startTimeRef = useRef(null);

  // Render LaTeX equation to safe HTML
  const katexHtml = useMemo(
    () => renderKaTeX(step.canvas_latex),
    [step.canvas_latex],
  );

  // Ghost pen left-to-right stroke reveal animation
  useEffect(() => {
    if (status === 'completed') {
      setRevealProgress(100);
      return;
    }

    if (status !== 'writing' || !isActive) {
      if (status === 'pending') setRevealProgress(0);
      return;
    }

    // Estimate reveal duration based on equation & speech length (~2.5s to 4.5s)
    const equationLength = (step.canvas_latex || '').length;
    const durationMs = Math.max(2400, Math.min(2000 + equationLength * 35, 5000));

    startTimeRef.current = performance.now();

    function animate(currentTime) {
      if (isPaused) {
        // Hold current reveal position while paused
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const elapsed = currentTime - (startTimeRef.current || currentTime);
      const progress = Math.min((elapsed / durationMs) * 100, 100);
      setRevealProgress(progress);

      if (progress < 100) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Reveal animation finished
        completeStepWriting(step.step_number);
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [completeStepWriting, isActive, isPaused, status, step.canvas_latex, step.step_number]);

  // If pending, hide or render as subtle placeholder
  if (status === 'pending') {
    return null;
  }

  const isWriting = status === 'writing';
  const showGraph = !!(step.graph_action?.should_plot || (step.graph_action?.functions?.length > 0));

  return (
    <div
      data-ghost-pen-step={step.step_number}
      className={`group relative my-2.5 rounded-xl border border-indigo-100/60 bg-gradient-to-r from-indigo-50/20 via-white to-transparent p-3 transition-all ${
        isActive ? 'ring-1 ring-indigo-300 shadow-xs' : ''
      }`}
    >
      {/* ── Main Equation & Margin Note Row ────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: Step number badge + animated equation */}
        <div className="flex flex-1 items-start gap-3 min-w-0">
          <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-bold text-white shadow-xs">
            {step.step_number}
          </span>

          <div className="relative flex-1 min-w-0 overflow-hidden">
            {/* KaTeX Math Equation with Left-to-Right Reveal Mask */}
            <div
              className="text-left font-serif text-base text-indigo-900 transition-all sm:text-lg"
              style={{
                clipPath: isWriting
                  ? `polygon(0 0, ${revealProgress}% 0, ${revealProgress}% 100%, 0 100%)`
                  : 'none',
              }}
              dangerouslySetInnerHTML={{ __html: katexHtml }}
            />

            {/* Glowing Ghost Pen nib cursor tracking the reveal edge */}
            {isWriting && revealProgress > 0 && revealProgress < 100 && (
              <div
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-75"
                style={{ left: `${revealProgress}%` }}
              >
                <div className="flex items-center gap-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-md shadow-indigo-300">
                  <span className="h-1.5 w-1.5 animate-ping rounded-full bg-amber-300" />
                  <span className="text-[10px]">✍️</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Handwritten Margin Note */}
        {step.margin_note && (
          <div className="shrink-0 self-end sm:self-start">
            <span
              className="inline-block -rotate-1 rounded-md border border-amber-200/80 bg-amber-50/70 px-2 py-0.5 font-['Caveat',cursive] text-sm font-semibold tracking-wide text-amber-900 shadow-2xs sm:text-base"
              style={{ fontFamily: "'Caveat', cursive" }}
            >
              ✎ {step.margin_note}
            </span>
          </div>
        )}
      </div>

      {/* ── Floating [⏸ Pause / Ask Why] Interrupt Chip ─────────────── */}
      {isActive && (
        <div className="mt-2 flex items-center justify-between border-t border-indigo-100/60 pt-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[11px] font-medium text-slate-500">
              {isPaused ? 'Paused for student' : 'Claire is explaining step...'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isPaused ? (
              <button
                type="button"
                onClick={resumePlayback}
                className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 shadow-2xs transition hover:bg-indigo-100 active:scale-95"
              >
                <span>▶ Resume</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => interruptAndAskWhy(step)}
                className="flex items-center gap-1 rounded-full border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 shadow-2xs transition hover:border-amber-400 hover:shadow-xs active:scale-95"
              >
                <span>⏸ Pause / Ask Why</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Optional Spawner: Interactive Mafs 2D Graph ─────────────── */}
      {showGraph && (
        <div className="mt-2.5">
          <InlineNotebookGraph
            graphAction={step.graph_action}
            stepNumber={step.step_number}
          />
        </div>
      )}
    </div>
  );
}

