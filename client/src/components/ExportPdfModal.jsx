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
  const [activeTab, setActiveTab] = useState('layout'); // 'layout' | 'spooler'
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
      message: 'Spooling high-res 2x canvas pages...',
    });

    try {
      await exportNotebookToPdf(notebookTitle, pageElements, {
        preset,
        paperBackground,
        onProgress: (current, total, message) => {
          setProgressState({ current, total, message });
        },
      });

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 backdrop-blur-sm select-none font-mono">
      <div className="relative w-full max-w-xl bg-[#D4D0C8] window-outer-chassis p-1 text-xs shadow-2xl">
        {/* Cobalt Gradient Title Bar */}
        <div className="h-7 bg-gradient-to-r from-[#000080] via-[#09419b] to-[#1084D0] px-2 flex items-center justify-between text-white">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🖨️</span>
            <span className="font-bold tracking-wide text-xs">
              Export Notebook to PDF [Print Spooler 300 DPI]
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="bevel-button bg-[#D4D0C8] text-red-700 w-4 h-4 flex items-center justify-center font-bold text-[10px]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="flex items-end px-2 pt-2 gap-1 border-b-2 border-[#808080] bg-[#D4D0C8]">
          <button
            type="button"
            onClick={() => setActiveTab('layout')}
            className={`px-3 py-1 font-bold text-xs ${
              activeTab === 'layout'
                ? 'bg-[#D4D0C8] border-t-2 border-l-2 border-white border-r-2 border-[#808080] -mb-[2px] z-10 text-[#0F172A]'
                : 'text-slate-600 hover:text-black'
            }`}
          >
            [ General &amp; PDF Layout ]
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('spooler')}
            className={`px-3 py-1 font-bold text-xs ${
              activeTab === 'spooler'
                ? 'bg-[#D4D0C8] border-t-2 border-l-2 border-white border-r-2 border-[#808080] -mb-[2px] z-10 text-[#0F172A]'
                : 'text-slate-600 hover:text-black'
            }`}
          >
            [ Printer Spooler &amp; Telemetry ]
          </button>
        </div>

        {/* Body Content */}
        <div className="p-3 sm:p-4 bg-[#D4D0C8] space-y-3 text-[#0F172A]">
          {activeTab === 'layout' ? (
            <>
              {/* Preset Selector */}
              <div>
                <label className="block font-bold text-xs mb-1.5 text-[#0F172A]">
                  Export Presentation Mode:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => setPreset('submission')}
                    className={`p-2.5 text-left transition flex flex-col justify-between ${
                      preset === 'submission'
                        ? 'bevel-inset bg-white text-[#0F172A]'
                        : 'bevel-button bg-[#D4D0C8] hover:bg-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <span>🎓</span>
                      <span>Clean Submission Mode</span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1 leading-tight">
                      Unifies Ghost Pen ink with student ballpoint ink (#1A1A2E). Hides margin hints for homework turn-in.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => setPreset('study_guide')}
                    className={`p-2.5 text-left transition flex flex-col justify-between ${
                      preset === 'study_guide'
                        ? 'bevel-inset bg-white text-[#0F172A]'
                        : 'bevel-button bg-[#D4D0C8] hover:bg-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <span>💡</span>
                      <span>Study &amp; Revision Guide</span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1 leading-tight">
                      Preserves vibrant AI indigo ink, cursive margin hints, and mistake check badges for studying.
                    </p>
                  </button>
                </div>
              </div>

              {/* Background Options */}
              <div>
                <label className="block font-bold text-xs mb-1.5 text-[#0F172A]">
                  Paper Background Rendering:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => setPaperBackground('keep')}
                    className={`py-1.5 px-2 text-xs font-bold text-center ${
                      paperBackground === 'keep'
                        ? 'bevel-inset bg-[#000080] text-white'
                        : 'bevel-button bg-[#D4D0C8] text-[#0F172A]'
                    }`}
                  >
                    Keep Ruled / Grid Lines
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => setPaperBackground('white')}
                    className={`py-1.5 px-2 text-xs font-bold text-center ${
                      paperBackground === 'white'
                        ? 'bevel-inset bg-[#000080] text-white'
                        : 'bevel-button bg-[#D4D0C8] text-[#0F172A]'
                    }`}
                  >
                    Clean White Paper
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="bevel-inset bg-[#0d0e15] p-3 text-[#00F0FF] space-y-1 font-mono">
                <p>&gt; SPOOLER_STATUS: ONLINE (Win32 Spooler Core)</p>
                <p>&gt; TARGET_SHEET: ISO A4 (210mm x 297mm)</p>
                <p>&gt; RESOLUTION_DPI: 600 DPI (2x Render Scale via html2canvas)</p>
                <p>&gt; DETECTED_PAGES: {totalPages} Pages</p>
                <p className="text-[#39FF14]">&gt; VECTOR_FORMAT: jsPDF v4.0 Embedded Fonts</p>
              </div>
            </div>
          )}

          {/* Progress Section */}
          {isExporting && (
            <div className="space-y-1 bg-[#0d0e15] p-2 bevel-inset text-white">
              <div className="flex justify-between text-[10px] font-bold text-[#00F0FF]">
                <span>{progressState.message || 'Exporting...'}</span>
                <span>{progressPercent}%</span>
              </div>
              {/* Segmented LED Loading Bar */}
              <div className="h-3 bg-[#1e1f26] border border-[#808080] flex items-center p-0.5 gap-0.5">
                {Array.from({ length: 20 }).map((_, idx) => {
                  const filled = (idx / 20) * 100 <= progressPercent;
                  return (
                    <span
                      key={idx}
                      className={`h-full flex-1 ${
                        filled ? 'bg-[#39FF14]' : 'bg-[#34343c]'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-2 border-t-2 border-[#808080] flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-600 font-bold">
              {totalPages} Page{totalPages === 1 ? '' : 's'} Ready
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isExporting}
                className="bevel-button bg-[#D4D0C8] px-3 py-1.5 text-xs font-bold hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting || totalPages === 0}
                className="bevel-button bg-[#00F0FF] text-[#00363a] px-4 py-1.5 font-black text-xs bevel-button-pressed border hover:brightness-105 disabled:opacity-50 flex items-center gap-1.5"
              >
                <span>{isExporting ? 'Spooling PDF…' : 'Download Solved PDF →'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Status Groove */}
        <div className="bg-[#C8C4BC] px-2 py-0.5 text-[10px] text-slate-700 flex justify-between border-t border-[#808080]">
          <span>PRINT_SUBSYSTEM: READY</span>
          <span>A4_210x297MM</span>
        </div>
      </div>
    </div>
  );
}
