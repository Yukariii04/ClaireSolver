import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Quick action definitions
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  {
    id: 'solve',
    label: 'Solve Step-by-Step',
    icon: '✍️',
    description: 'Break down and solve this math step',
    btnClass: 'hover:border-indigo-300 hover:bg-indigo-50 text-indigo-900',
  },
  {
    id: 'check_mistake',
    label: 'Check My Mistake',
    icon: '🔍',
    description: 'Diagnose arithmetic or sign errors',
    btnClass: 'hover:border-amber-300 hover:bg-amber-50 text-amber-900',
  },
  {
    id: 'hint',
    label: 'Give Hint',
    icon: '💡',
    description: 'Nudge in the right direction',
    btnClass: 'hover:border-emerald-300 hover:bg-emerald-50 text-emerald-900',
  },
  {
    id: 'graph',
    label: 'Plot Graph',
    icon: '📈',
    description: 'Generate interactive 2D function visual',
    btnClass: 'hover:border-cyan-300 hover:bg-cyan-50 text-cyan-900',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MarkerActionPopover({
  position,
  onAction,
  onClose,
  isHarvesting = false,
}) {
  const [query, setQuery] = useState('');
  const popoverRef = useRef(null);
  const inputRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus input on mount if not harvesting
  useEffect(() => {
    if (!isHarvesting) {
      inputRef.current?.focus();
    }
  }, [isHarvesting]);

  function handleCustomSubmit(e) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isHarvesting) return;
    onAction({ action: 'custom', query: trimmed });
  }

  function handleQuickAction(actionId) {
    if (isHarvesting) return;
    onAction({ action: actionId, query: '' });
  }

  // Calculate clamped style position to prevent spilling off the screen
  const popoverStyle = {
    top: Math.max(16, position.top),
    left: Math.max(16, Math.min(position.left, window.innerWidth - 360)),
  };

  return (
    <div
      ref={popoverRef}
      style={popoverStyle}
      className="fixed z-50 w-80 animate-in fade-in zoom-in-95 rounded-2xl border border-white/80 bg-white/95 p-3.5 shadow-2xl shadow-indigo-900/15 backdrop-blur-2xl transition duration-150 sm:w-96"
      role="dialog"
      aria-label="Claire Ask Marker Options"
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-indigo-500 text-xs text-white shadow-xs">
            ✨
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Ask Claire
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          title="Dismiss"
          aria-label="Close popover"
        >
          ✕
        </button>
      </div>

      {/* ── Status if harvesting context ─────────────────────────── */}
      {isHarvesting ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-xs font-semibold text-slate-700">
            Harvesting handwriting context…
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Capturing high-res crop and full page snapshot
          </p>
        </div>
      ) : (
        <>
          {/* ── Quick Action Buttons ──────────────────────────────── */}
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {QUICK_ACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleQuickAction(item.id)}
                className={`flex flex-col items-start rounded-xl border border-slate-200/80 bg-white/60 p-2 text-left transition hover:shadow-xs active:scale-98 ${item.btnClass}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm leading-none">{item.icon}</span>
                  <span className="text-xs font-semibold">{item.label}</span>
                </div>
                <span className="mt-1 text-[10px] leading-tight text-slate-400 line-clamp-1">
                  {item.description}
                </span>
              </button>
            ))}
          </div>

          {/* ── Custom Question Input ─────────────────────────────── */}
          <form onSubmit={handleCustomSubmit} className="mt-2.5">
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a question about this selection..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-3 pr-9 text-xs text-slate-800 placeholder:text-slate-400 transition focus:border-indigo-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                className="absolute right-1.5 grid h-6 w-6 place-items-center rounded-lg bg-indigo-600 text-xs text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600"
                title="Send to Claire"
                aria-label="Send question"
              >
                ↵
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

