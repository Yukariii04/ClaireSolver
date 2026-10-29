import { useRef, useEffect } from 'react';
import katex from 'katex';

function renderTextWithMath(rawText) {
  if (!rawText) return null;
  // Match $...$ expressions
  const parts = rawText.split(/(\$[^$]+\$)/g);

  return parts.map((part, idx) => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const math = part.slice(1, -1);
      try {
        const html = katex.renderToString(math, {
          throwOnError: false,
          output: 'htmlAndMathml',
        });
        return (
          <span
            key={idx}
            className="inline-block mx-1 notebook-math-inline align-baseline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        return <span key={idx} className="font-mono text-sm">{part}</span>;
      }
    }
    return <span key={idx}>{part}</span>;
  });
}

export default function StudentHandwritingLine({
  line,
  isEditing,
  onStartEdit,
  onChangeText,
  onChangeMargin,
  onEnter,
  onBackspaceEmpty,
  onBlur,
  isWriteToolActive,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  return (
    <div
      className="group relative w-full flex items-baseline my-0 select-text"
      style={{ minHeight: '32px', lineHeight: '32px' }}
    >
      {/* ── Left Margin Column (Left of 72px red margin rule) ────────── */}
      <div className="w-[72px] shrink-0 pr-3.5 text-right select-none">
        {isEditing ? (
          <input
            type="text"
            value={line.marginLabel || ''}
            onChange={(e) => onChangeMargin?.(e.target.value)}
            placeholder="•"
            className="w-full text-right handwriting-ink-student text-lg font-bold bg-transparent outline-none"
          />
        ) : (
          <span
            onClick={onStartEdit}
            className="handwriting-ink-student text-lg font-bold inline-block cursor-text"
          >
            {line.marginLabel || (isWriteToolActive ? '•' : '')}
          </span>
        )}
      </div>

      {/* ── Ruled Main Body (Directly on the 32px blue lines) ───────── */}
      <div className="flex-1 min-w-0 pl-3">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={line.text || ''}
            onChange={(e) => onChangeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onEnter?.();
              } else if (e.key === 'Backspace' && !line.text) {
                e.preventDefault();
                onBackspaceEmpty?.();
              } else if (e.key === 'Escape') {
                onBlur?.();
              }
            }}
            onBlur={onBlur}
            placeholder="Type your math step or note... (e.g. 2x + 4 = 10 or $x^2$)"
            className="w-full handwriting-ink-student text-2xl leading-[32px] bg-transparent outline-none border-b border-indigo-300/60 placeholder:font-mono placeholder:text-xs placeholder:text-slate-400 placeholder:italic"
          />
        ) : (
          <div
            onClick={onStartEdit}
            className={`handwriting-ink-student text-2xl leading-[32px] min-h-[32px] cursor-text transition-colors ${
              !line.text ? 'text-slate-400 italic font-mono text-xs' : ''
            }`}
          >
            {line.text ? renderTextWithMath(line.text) : (isWriteToolActive ? '+ click to write...' : '')}
          </div>
        )}
      </div>
    </div>
  );
}

