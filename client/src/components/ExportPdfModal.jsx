import { useState } from 'react';
import { exportNotebookToPdf } from '../utils/exportNotebookToPdf.js';

export default function ExportPdfModal({
  isOpen,
  onClose,
  notebookTitle = 'Homework Notebook',
  pageElements = [],
}) {
  const [preset, setPreset] = useState('submission'); // 'submission' | 'study_guide'
  const [paperBackground, setPaperBackground] = useState('keep'); // 'keep' | 'white'
  const [isExporting, setIsExporting] = useState(false);
  const [progressState, setProgressState] = useState({
    current: 0,
    total: 0,
    message: '',
  });

  if (!isOpen) return null;

  const totalPages = pageElements?.length || 0;

  async function handleExport() {
    if (totalPages === 0 || isExporting) return;

    setIsExporting(true);
    setProgressState({
      current: 0,
      total: totalPages,
      message: 'Preparing pages for high-res snapshot...',
    });

    try {
      await exportNotebookToPdf(notebookTitle, pageElements, {
        preset,
        paperBackground,
        onProgress: (current, total, message) => {
          setProgressState({ current, total, message });
        },
      });

      // Brief delay so student sees completion before closing
      setTimeout(() => {
        setIsExporting(false);
        onClose();
      }, 500);
    } catch (err) {
      console.error('[Export PDF error]', err);
      setProgressState({
        current: 0,
        total: totalPages,
        message: `Export failed: ${err.message || 'Unknown error'}`,
      });
      setIsExporting(false);
    }
  }

  const progressPercent =
    progressState.total > 0
      ? Math.round((progressState.current / progressState.total) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-white/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* ── Modal Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-xs">
              📄
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Export Homework PDF
              </h2>
              <p className="text-xs text-slate-500">
                {totalPages} {totalPages === 1 ? 'page' : 'pages'} ready to export in standard A4
              </p>
            </div>
          </div>
          {!isExporting && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Modal Body: Customization Options ─────────────────────── */}
        <div className="mt-4 space-y-4">
          {/* Preset Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Export Presentation Mode
            </label>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setPreset('submission')}
                className={[
                  'flex flex-col items-start rounded-xl border p-3 text-left transition',
                  preset === 'submission'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-200'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                ].join(' ')}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🎓</span>
                  <span className="text-xs font-bold text-slate-900">
                    Clean Submission
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-tight text-slate-500">
                  Unifies Ghost Pen math into student's ink. Hides margin notes and AI chips for official homework hand-in.
                </p>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => setPreset('study_guide')}
                className={[
                  'flex flex-col items-start rounded-xl border p-3 text-left transition',
                  preset === 'study_guide'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-200'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                ].join(' ')}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">💡</span>
                  <span className="text-xs font-bold text-slate-900">
                    Revision Study Guide
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-tight text-slate-500">
                  Preserves distinct AI tutor ink, teacher margin callouts, and mistake check notes for exam prep.
                </p>
              </button>
            </div>
          </div>

          {/* Paper Background Options */}
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Paper Background Style
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setPaperBackground('keep')}
                className={[
                  'flex items-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition',
                  paperBackground === 'keep'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-200 font-semibold'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                ].join(' ')}
              >
                <span>📐</span>
                <span>Keep Grid/Ruled Lines</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => setPaperBackground('white')}
                className={[
                  'flex items-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition',
                  paperBackground === 'white'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-200 font-semibold'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                ].join(' ')}
              >
                <span>📄</span>
                <span>Clean White Paper</span>
              </button>
            </div>
          </div>

          {/* Live Progress Bar when rendering */}
          {isExporting && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                <span>{progressState.message || 'Exporting PDF...'}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-indigo-200/60">
                <div
                  className="h-full bg-indigo-600 transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Footer ─────────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isExporting || totalPages === 0}
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 active:scale-98 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-white" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <span>📥 Download A4 PDF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

