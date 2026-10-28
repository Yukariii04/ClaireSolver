import { useState } from 'react';

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    id: 'pen',
    label: 'Pen',
    icon: '✎',
    activeClass: 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm',
  },
  {
    id: 'eraser',
    label: 'Eraser',
    icon: '⌫',
    activeClass: 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm',
  },
  {
    id: 'marker',
    label: '✨ Ask Marker',
    icon: '✨',
    activeClass: 'border-amber-300 bg-amber-50 text-amber-700 shadow-sm',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FloatingDock({
  activeTool,
  strokeWidth,
  onToolChange,
  onStrokeWidthChange,
  onUndo,
  onRedo,
  onExtendPage,
  canExtend,
  extending,
}) {
  const [sliderOpen, setSliderOpen] = useState(false);

  const showSlider = activeTool === 'pen' || activeTool === 'marker';

  return (
    <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-2xl border border-white/70 bg-white/80 px-2 py-2 shadow-2xl shadow-slate-400/30 backdrop-blur-2xl sm:gap-1.5 sm:px-3">
        {/* ── Tool buttons ──────────────────────────────────────── */}
        <div className="flex items-center gap-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                onToolChange(tool.id);
                if (tool.id === 'pen' || tool.id === 'marker') setSliderOpen(true);
                else setSliderOpen(false);
              }}
              title={tool.label}
              className={[
                'flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-medium transition sm:px-3',
                activeTool === tool.id
                  ? tool.activeClass
                  : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700',
              ].join(' ')}
            >
              <span className="text-base leading-none">{tool.icon}</span>
              <span className="hidden sm:inline">{tool.label}</span>
            </button>
          ))}
        </div>

        {/* ── Stroke width slider ───────────────────────────────── */}
        {showSlider && (
          <>
            <div className="mx-1 h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] font-medium text-slate-400">Thin</span>
              <input
                type="range"
                min={1}
                max={12}
                step={0.5}
                value={strokeWidth}
                onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600 sm:w-28"
              />
              <span className="text-[10px] font-medium text-slate-400">Thick</span>
            </div>
          </>
        )}

        {/* ── Divider ───────────────────────────────────────────── */}
        <div className="mx-1 h-6 w-px bg-slate-200" />

        {/* ── Undo / Redo ───────────────────────────────────────── */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onUndo}
            title="Undo"
            className="rounded-xl px-2.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={onRedo}
            title="Redo"
            className="rounded-xl px-2.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ↷
          </button>
        </div>

        {/* ── Divider ───────────────────────────────────────────── */}
        <div className="mx-1 h-6 w-px bg-slate-200" />

        {/* ── Extend Page ───────────────────────────────────────── */}
        <button
          type="button"
          onClick={onExtendPage}
          disabled={!canExtend || extending}
          title="Insert continuation page below"
          className="flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-2 text-sm font-semibold text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-base leading-none">+</span>
          <span className="hidden sm:inline">
            {extending ? 'Adding…' : 'Extend Page'}
          </span>
        </button>
      </div>
    </div>
  );
}

