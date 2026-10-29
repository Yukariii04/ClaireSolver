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

    // Estimate reveal duration based on equation & speech length (~2.4s to 4.5s)
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

  // If pending, hide
  if (status === 'pending') {
    return null;
  }

  const isWriting = status === 'writing';
  const showGraph = !!(step.graph_action?.should_plot || (step.graph_action?.functions?.length > 0));

  return (
    <div
      data-ghost-pen-step={step.step_number}
      className="group relative w-full flex items-start my-1 text-left select-text"
      style={{ minHeight: '32px' }}
    >
      {/* ── Left Margin Column (Left of 72px red margin rule) ────────── */}
      <div className="w-[72px] shrink-0 pr-3.5 text-right select-none pt-0.5">
        <span
          className="handwriting-ink-ai text-xl font-bold inline-block"
          title={`Step ${step.step_number}`}
        >
          ({step.step_number})
        </span>

        {/* Subtle active pulse in margin */}
        {isActive && (
          <span className="block text-[10px] font-mono font-bold text-[#FF2E93] leading-none animate-pulse">
            • AI
          </span>
        )}
      </div>

      {/* ── Ruled Main Body (Directly on the 32px blue lines) ───────── */}
      <div className="flex-1 min-w-0 pl-3">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-x-4 gap-y-1">
          {/* Main Math Derivation Line */}
          <div className="relative flex-1 min-w-0 notebook-math-row text-[#1e40af]">
            <div
              className="transition-all duration-75 text-left"
              style={{
                clipPath: isWriting
                  ? `polygon(0 0, ${revealProgress}% 0, ${revealProgress}% 100%, 0 100%)`
                  : 'none',
              }}
              dangerouslySetInnerHTML={{ __html: katexHtml }}
            />

            {/* Glowing Ghost Pen nib cursor tracking the ink reveal edge */}
            {isWriting && revealProgress > 0 && revealProgress < 100 && (
              <div
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20"
                style={{ left: `${revealProgress}%` }}
              >
                <div className="flex items-center gap-1 -translate-y-3">
                  <span className="text-base filter drop-shadow">✍️</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#39FF14] animate-ping" />
                </div>
              </div>
            )}
          </div>

          {/* Right Margin Note (Teacher handwriting annotation) */}
          {step.margin_note && (
            <div className="shrink-0 sm:self-center select-none" data-margin-note>
              <span className="handwriting-margin-note font-bold whitespace-nowrap">
                ✎ {step.margin_note}
              </span>
            </div>
          )}
        </div>

        {/* ── Active Interruption Button (Ask Claire Why) ─────────────── */}
        {isActive && (
          <div className="my-1 flex items-center justify-between border-t border-blue-200/50 pt-1 select-none">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#000080]">
              <span className="h-2 w-2 rounded-full bg-[#1084D0] animate-ping" />
              <span>{isPaused ? 'Paused for student question' : 'Claire is writing solution...'}</span>
            </div>

            <div>
              {isPaused ? (
                <button
                  type="button"
                  onClick={resumePlayback}
                  className="bevel-button bg-[#D4D0C8] px-2 py-0.5 text-xs font-bold text-[#000080] hover:bg-slate-200"
                >
                  ▶ Resume Writing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => interruptAndAskWhy(step)}
                  className="bevel-button bg-[#FFFBEB] px-2 py-0.5 text-xs font-bold text-[#b45309] hover:bg-yellow-100 flex items-center gap-1 border border-amber-300"
                >
                  <span>⏸ Ask Why</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Optional Spawner: Interactive Mafs 2D Graph ───────────── */}
        {showGraph && (
          <div className="my-2 border-l-2 border-indigo-400 pl-3 bg-white/50 backdrop-blur-xs py-1">
            <InlineNotebookGraph
              graphAction={step.graph_action}
              stepNumber={step.step_number}
            />
          </div>
        )}
      </div>
    </div>
  );
}
