import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../lib/api.js';

const ACCEPTED_TYPES = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/webm': '.webm',
};

const ACCEPT_STRING = '.pdf,.docx,.jpg,.jpeg,.png,.webp,.webm';
const MAX_SIZE = 25 * 1024 * 1024;

const PAPER_STYLES = [
  { value: 'grid', label: 'Grid Paper', icon: '▦' },
  { value: 'ruled', label: 'Ruled Notebook', icon: '☰' },
  { value: 'blank', label: 'Clean Blank', icon: '☐' },
];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name) {
  return (name || '').split('.').pop()?.toLowerCase() || '';
}

function isAcceptedFile(file) {
  if (ACCEPTED_TYPES[file.type]) return true;
  const ext = fileExtension(file.name);
  return ['pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'webm'].includes(ext);
}

export default function UploadWorksheetModal({ isOpen, onClose, onUploadComplete }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [paperStyle, setPaperStyle] = useState('ruled');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e) {
      if (e.key === 'Escape' && !isUploading) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isUploading, onClose]);

  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setUploadError('');
      setIsUploading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function validateAndSet(file) {
    setUploadError('');
    if (!file) return;
    if (!isAcceptedFile(file)) {
      setUploadError('Unsupported file type. Upload a PDF, DOCX, image, or WebM.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_SIZE) {
      setUploadError('File must be between 0 bytes and 25 MB.');
      return;
    }
    setSelectedFile(file);
  }

  function handleFileInput(e) {
    validateAndSet(e.target.files?.[0]);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    validateAndSet(file);
  }

  async function handleUpload() {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('worksheet', selectedFile);
      formData.append('paperStyle', paperStyle);

      const response = await authenticatedFetch('/api/notebooks/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${response.status})`);
      }

      const { notebookId } = await response.json();
      if (onUploadComplete) {
        onUploadComplete(notebookId);
      } else {
        window.location.href = `/notebook/${notebookId}`;
      }
    } catch (error) {
      setUploadError(error.message || 'Upload failed. Please check backend connection.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Upload worksheet"
    >
      <div className="relative w-full max-w-xl bg-[#D4D0C8] window-outer-chassis p-1 font-mono text-xs select-none shadow-2xl">
        {/* Cobalt Gradient Title Bar */}
        <div className="h-7 bg-gradient-to-r from-[#000080] via-[#09419b] to-[#1084D0] px-2 flex items-center justify-between text-white">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🖨️</span>
            <span className="font-bold tracking-wide text-xs">
              Universal Question Slicer &amp; Bounding Box Harvester
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="bevel-button bg-[#D4D0C8] text-red-700 w-4 h-4 flex items-center justify-center font-bold text-[10px]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Telemetry Strip */}
        <div className="px-2 py-1 bg-[#D4D0C8] border-b border-[#808080] flex items-center justify-between text-[10px]">
          <span className="text-slate-700 font-bold">
            SCAN_FEED: FLATBED_TRAY // 300 DPI 24-BIT
          </span>
          <span className="bg-[#0d0e15] text-[#39FF14] px-1.5 py-0.5 bevel-inset font-bold">
            GEMINI_VISION_OCR: READY
          </span>
        </div>

        {/* Body Container */}
        <div className="p-3 sm:p-4 bg-[#D4D0C8] space-y-3 text-[#0F172A]">
          {/* Drop Zone with Scanner Aesthetic */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer bevel-inset p-5 text-center transition ${
              isDragOver ? 'bg-[#00F0FF]/20 border-2 border-[#00F0FF]' : 'bg-[#0d0e15] text-white hover:bg-[#151620]'
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-2">
              <span className="text-3xl">📥</span>
              <p className="font-bold text-xs text-[#00F0FF]">
                {selectedFile ? selectedFile.name : 'DROP HOMEWORK WORKSHEET OR CLICK TO BROWSE'}
              </p>
              <p className="text-[10px] text-slate-400">
                {selectedFile
                  ? `File Size: ${formatBytes(selectedFile.size)} [Ready to Slice]`
                  : 'PDF, DOCX, JPG, PNG, WebP — Gemini 2.5 Flash detects and crops each problem'}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_STRING}
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {/* Paper Style Selector */}
          <div>
            <label className="block font-bold text-xs mb-1.5 text-[#0F172A]">
              Destination Notebook Paper Style:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PAPER_STYLES.map((style) => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => setPaperStyle(style.value)}
                  className={`py-1.5 px-2 text-xs font-bold ${
                    paperStyle === style.value
                      ? 'bevel-inset bg-[#000080] text-white'
                      : 'bevel-button bg-[#D4D0C8] text-[#0F172A] hover:bg-slate-200'
                  }`}
                >
                  <span className="mr-1">{style.icon}</span>
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {uploadError && (
            <div className="bg-red-100 border-2 border-red-500 p-2 text-xs font-bold text-red-900 bevel-sunken">
              [SCAN_ERR]: {uploadError}
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-2 border-t-2 border-[#808080] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="bevel-button bg-[#D4D0C8] px-3 py-1.5 text-xs font-bold hover:bg-slate-200"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className="bevel-button bg-[#00F0FF] text-[#00363a] px-4 py-1.5 font-black text-xs bevel-button-pressed border hover:brightness-105 disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>{isUploading ? '⚡ Slicing with Gemini…' : 'Scan & Slice Questions →'}</span>
            </button>
          </div>
        </div>

        {/* Status Inset */}
        <div className="bg-[#C8C4BC] px-2 py-0.5 text-[10px] text-slate-700 flex justify-between border-t border-[#808080]">
          <span>TWAIN_32: READY</span>
          <span>ROI_PADDING: 15%</span>
        </div>
      </div>
    </div>
  );
}
