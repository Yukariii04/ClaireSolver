import { useMemo, useState } from 'react';
import { Mafs, Coordinates, Plot, Point, Theme } from 'mafs';

// ---------------------------------------------------------------------------
// Math expression compiler: converts string math -> safe JS function (x) => y
// ---------------------------------------------------------------------------

const PALETTE = [Theme.indigo || '#6366f1', Theme.teal || '#14b8a6', Theme.pink || '#ec4899', '#f59e0b'];

export function compileMathFunction(exprStr) {
  if (!exprStr || typeof exprStr !== 'string') {
    return () => NaN;
  }

  try {
    let clean = exprStr.trim();

    // Remove leading 'y = ' or 'f(x) = '
    clean = clean.replace(/^(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '');

    // Replace LaTeX backslash functions
    clean = clean
      .replace(/\\sin/g, 'sin')
      .replace(/\\cos/g, 'cos')
      .replace(/\\tan/g, 'tan')
      .replace(/\\exp/g, 'exp')
      .replace(/\\ln/g, 'log')
      .replace(/\\log/g, 'log')
      .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
      .replace(/\\sqrt/g, 'sqrt')
      .replace(/\\pi/g, 'pi');

    // Replace power operator
    clean = clean.replace(/\^/g, '**');

    // Implicit multiplication: 2x -> 2*x, 4sin -> 4*sin, )x -> )*x
    clean = clean
      .replace(/(\d+)\s*([a-zA-Z(])/g, '$1*$2')
      .replace(/\)\s*(\d+|[a-zA-Z(])/g, ')*$1');

    // Mathematical symbols and functions mapping to Math object
    clean = clean
      .replace(/\bsin\b/g, 'Math.sin')
      .replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan')
      .replace(/\bexp\b/g, 'Math.exp')
      .replace(/\blog\b/g, 'Math.log')
      .replace(/\bln\b/g, 'Math.log')
      .replace(/\bsqrt\b/g, 'Math.sqrt')
      .replace(/\babs\b/g, 'Math.abs')
      .replace(/\bpi\b/gi, 'Math.PI')
      .replace(/\be\b/g, 'Math.E');

    // Create a safe evaluator
    // eslint-disable-next-line no-new-func
    const evaluator = new Function('x', `"use strict"; return (${clean});`);

    return (x) => {
      try {
        const val = evaluator(x);
        return typeof val === 'number' && Number.isFinite(val) ? val : NaN;
      } catch {
        return NaN;
      }
    };
  } catch (err) {
    console.warn('[Math compile warning]', exprStr, err);
    return () => NaN;
  }
}

// ---------------------------------------------------------------------------
// Component: InlineNotebookGraph
// ---------------------------------------------------------------------------

export default function InlineNotebookGraph({
  graphAction,
  stepNumber,
  title,
}) {
  const [viewKey, setViewKey] = useState(0);

  const functions = useMemo(
    () => (Array.isArray(graphAction?.functions) ? graphAction.functions : []),
    [graphAction?.functions],
  );

  const compiledFunctions = useMemo(
    () =>
      functions.map((fnStr, index) => ({
        original: fnStr,
        fn: compileMathFunction(fnStr),
        color: PALETTE[index % PALETTE.length],
      })),
    [functions],
  );

  const highlightPoints = useMemo(() => {
    if (!Array.isArray(graphAction?.highlight_points)) return [];
    return graphAction.highlight_points.filter(
      (pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]),
    );
  }, [graphAction?.highlight_points]);

  const xDomain = useMemo(() => {
    if (
      Array.isArray(graphAction?.x_domain) &&
      graphAction.x_domain.length === 2 &&
      Number.isFinite(graphAction.x_domain[0]) &&
      Number.isFinite(graphAction.x_domain[1])
    ) {
      return graphAction.x_domain;
    }
    return [-5, 5];
  }, [graphAction?.x_domain]);

  if (!graphAction?.should_plot && functions.length === 0) {
    return null;
  }

  function handleResetView(e) {
    e.stopPropagation();
    setViewKey((k) => k + 1);
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="my-3 w-full max-w-lg overflow-hidden rounded-2xl border border-indigo-100 bg-white/90 shadow-md backdrop-blur-md transition-all select-none"
    >
      {/* ── Graph Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-indigo-50 bg-gradient-to-r from-indigo-50/70 via-white to-slate-50 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-bold text-white shadow-xs">
            📈
          </span>
          <div>
            <span className="text-xs font-semibold text-slate-800">
              {title || (stepNumber ? `Interactive Graph — Step ${stepNumber}` : 'Interactive 2D Graph')}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetView}
          title="Reset zoom and center"
          className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs transition hover:border-indigo-300 hover:text-indigo-600 active:scale-95"
        >
          Reset view
        </button>
      </div>

      {/* ── Mafs Interactive Canvas ─────────────────────────────────── */}
      <div className="relative h-[230px] w-full bg-[#fdfdfd]">
        <Mafs
          key={viewKey}
          height={230}
          width="auto"
          viewBox={{
            x: xDomain,
            y: [-4, 4],
          }}
          preserveAspectRatio={false}
        >
          <Coordinates.Cartesian
            subdivisions={2}
            lines={1}
            xAxis={{
              lines: 1,
              labels: (n) => (n % 2 === 0 ? String(n) : ''),
            }}
            yAxis={{
              lines: 1,
              labels: (n) => (n % 2 === 0 ? String(n) : ''),
            }}
          />

          {/* Plotted Curves */}
          {compiledFunctions.map((item, index) => (
            <Plot.OfX
              key={`plot-${index}-${item.original}`}
              y={item.fn}
              color={item.color}
              weight={2.5}
            />
          ))}

          {/* Highlight Points */}
          {highlightPoints.map((pt, idx) => (
            <Point
              key={`pt-${idx}-${pt[0]}-${pt[1]}`}
              x={pt[0]}
              y={pt[1]}
              color="#dc2626"
            />
          ))}
        </Mafs>

        {/* Highlight points label badges overlay */}
        {highlightPoints.length > 0 && (
          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1">
            {highlightPoints.map((pt, idx) => (
              <span
                key={`badge-${idx}`}
                className="rounded-md border border-rose-200 bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 shadow-2xs backdrop-blur-xs"
              >
                ● ({pt[0]}, {pt[1]})
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Function Legend Footer ─────────────────────────────────── */}
      {functions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/50 px-3.5 py-1.5">
          <span className="text-[10px] font-medium text-slate-400">Functions:</span>
          {compiledFunctions.map((item, idx) => (
            <div key={`legend-${idx}`} className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-mono text-[11px] font-medium text-slate-700">
                {item.original}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

