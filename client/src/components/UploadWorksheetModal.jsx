import { useCallback, useEffect, useRef, useState } from 'react';
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
  { value: 'grid', label: 'Grid', icon: '▦' },
  { value: 'ruled', label: 'Ruled', icon: '☰' },
  { value: 'blank', label: 'Blank', icon: '☐' },
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
  const [paperStyle, setPaperStyle] = useState('grid');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const overlayRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e) {
      if (e.key === 'Escape' && !isUploading) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isUploading, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setPaperStyle('grid');
      setUploadError('');
      setIsUploading(false);
      setIsDragOver(false);
    }
  }, [isOpen]);

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === overlayRef.current && !isUploading) onClose();
    },
    [isUploading, onClose],
  );

  // --- File selection ---
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

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setIsDragOver(false);
  }

  // --- Upload ---
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
      onUploadComplete(notebookId);
    } catch (error) {
      setUploadError(error.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Upload worksheet"
    >
      <div className="mx-4 w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-indigo-600 to-cyan-500 px-6 py-5">
          <h2 className="text-lg font-semibold text-white">Upload Worksheet</h2>
          <p className="mt-1 text-sm text-white/80">
            Upload a worksheet and we'll slice it into individual questions.
          </p>
          {!isUploading && (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <div className="space-y-5 p-6">
          {/* Drop zone */}
          {!selectedFile ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                isDragOver
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50'
              }`}
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-100 text-2xl text-indigo-600">
                ↑
              </span>
              <p className="mt-4 text-sm font-semibold text-slate-700">
                Drop your file here or click to browse
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                PDF, DOCX, JPG, PNG, WebP, or WebM — up to 25 MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_STRING}
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-sm font-bold uppercase text-indigo-700">
                {fileExtension(selectedFile.name).slice(0, 4)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-slate-500">{formatBytes(selectedFile.size)}</p>
              </div>
              {!isUploading && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setUploadError('');
                  }}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                >
                  Change
                </button>
              )}
            </div>
          )}

          {/* Paper style selector */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Paper style</label>
            <div className="flex gap-2">
              {PAPER_STYLES.map((style) => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => setPaperStyle(style.value)}
                  disabled={isUploading}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                    paperStyle === style.value
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="text-base">{style.icon}</span>
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {uploadError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {uploadError}
            </div>
          )}

          {/* Upload button */}
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-slate-900"
          >
            {isUploading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Processing worksheet…
              </>
            ) : (
              'Upload & Slice Questions'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

