const TOOLS = [
  {
    id: 'pen',
    label: '✎ Draw',
    icon: '✎',
    activeClass: 'bevel-inset bg-[#000080] text-white',
  },
  {
    id: 'write',
    label: '✍️ Write',
    icon: '✍️',
    activeClass: 'bevel-inset bg-[#000080] text-[#00F0FF] font-bold',
  },
  {
    id: 'eraser',
    label: '⌫ Eraser',
    icon: '⌫',
    activeClass: 'bevel-inset bg-red-800 text-white',
  },
  {
    id: 'marker',
    label: '✨ Ask Marker',
    icon: '✨',
    activeClass: 'bevel-inset bg-[#FF2E93] text-black font-black',
  },
];

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
  const showSlider = activeTool === 'pen' || activeTool === 'marker';

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 font-mono select-none">
      <div className="bg-[#D4D0C8] window-outer-chassis p-1.5 flex items-center gap-1.5 shadow-2xl">
        {/* Grip header */}
        <span className="text-[10px] text-slate-500 font-bold px-1 border-r border-[#808080] hidden md:inline">
          ::: DOCK :::
        </span>

        {/* Tool Buttons */}
        <div className="flex items-center gap-1">
          {TOOLS.map((tool) => {
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onToolChange(tool.id)}
                title={tool.label}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold transition ${
                  isActive
                    ? tool.activeClass
                    : 'bevel-button hover:bg-slate-200 text-[#0F172A]'
                }`}
              >
                <span className="text-sm leading-none">{tool.icon}</span>
                <span className="hidden sm:inline">{tool.label}</span>
              </button>
            );
          })}
        </div>

        {/* Stroke Width Stepper */}
        {showSlider && (
          <div className="flex items-center gap-1.5 px-1.5 bevel-inset bg-[#C8C4BC] py-0.5">
            <span className="text-[9px] font-bold text-slate-700">WIDTH:</span>
            <input
              type="range"
              min={1}
              max={12}
              step={0.5}
              value={strokeWidth}
              onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
              className="h-1.5 w-16 sm:w-20 cursor-pointer accent-[#000080]"
            />
            <span className="text-[9px] font-bold text-[#000080]">{strokeWidth}px</span>
          </div>
        )}

        <div className="h-5 w-px bg-[#808080] mx-0.5" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            title="Undo"
            className="bevel-button px-2 py-1 text-xs font-bold hover:bg-slate-200"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={onRedo}
            title="Redo"
            className="bevel-button px-2 py-1 text-xs font-bold hover:bg-slate-200"
          >
            ↷
          </button>
        </div>

        <div className="h-5 w-px bg-[#808080] mx-0.5" />

        {/* Extend Page */}
        <button
          type="button"
          onClick={onExtendPage}
          disabled={!canExtend || extending}
          title="Insert continuation page below"
          className="bevel-button bg-[#00F0FF] text-[#00363a] px-3 py-1 text-xs font-black bevel-button-pressed border hover:brightness-105 disabled:opacity-50 flex items-center gap-1"
        >
          <span>+</span>
          <span className="hidden sm:inline">
            {extending ? 'Spooling…' : 'Extend Page'}
          </span>
        </button>
      </div>
    </div>
  );
}
