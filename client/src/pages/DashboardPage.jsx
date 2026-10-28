import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { auth } from '../config/firebase.js';
import { useNotebookStore } from '../store/useNotebookStore.js';
import UploadWorksheetModal from '../components/UploadWorksheetModal.jsx';

function formatDate(value) {
  if (value == null) return 'Just created';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 'Just created';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function initialsFor(user) {
  const name = user?.displayName || user?.email || 'Math student';
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const notebooks = useNotebookStore((state) => state.notebooks);
  const isLoading = useNotebookStore((state) => state.isLoading);
  const isCreating = useNotebookStore((state) => state.isCreating);
  const uploadProgress = useNotebookStore((state) => state.uploadProgress);
  const storeError = useNotebookStore((state) => state.error);
  const watchNotebooks = useNotebookStore((state) => state.watchNotebooks);
  const createNotebook = useNotebookStore((state) => state.createNotebook);
  const uploadWorksheet = useNotebookStore((state) => state.uploadWorksheet);
  const clearError = useNotebookStore((state) => state.clearError);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pageError, setPageError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      return watchNotebooks();
    } catch (error) {
      setPageError(error.message);
      return undefined;
    }
  }, [watchNotebooks, user?.uid]);

  async function handleCreateNotebook() {
    setPageError('');
    clearError();
    try {
      const notebookId = await createNotebook({ title: 'Untitled Notebook' });
      setMenuOpen(false);
      navigate(`/notebook/${notebookId}`);
    } catch (error) {
      setPageError(error.message);
    }
  }

  async function handleWorksheetSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setPageError('');
    clearError();
    try {
      const notebookId = await uploadWorksheet(file);
      setMenuOpen(false);
      navigate(`/notebook/${notebookId}`);
    } catch (error) {
      setPageError(error.message);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch {
      setPageError('Could not sign out right now. Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Student';
  const shownError = pageError || storeError;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f3f5fb] text-slate-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-36 h-[28rem] w-[28rem] rounded-full bg-indigo-200/60 blur-[100px]" />
        <div className="absolute -left-32 top-[35rem] h-[24rem] w-[24rem] rounded-full bg-cyan-100/80 blur-[100px]" />
      </div>

      <header className="relative border-b border-white/70 bg-white/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/dashboard" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-xl text-white shadow-md shadow-indigo-200">∑</span>
            <span>Math Notebook</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{displayName}</p>
              <p className="max-w-48 truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-full border border-white bg-white/90 text-sm font-bold text-indigo-700 shadow-sm">
              {initialsFor(user)}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-950 disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="flex flex-col justify-between gap-7 rounded-[2rem] border border-white/80 bg-white/60 p-6 shadow-xl shadow-indigo-100/40 backdrop-blur-2xl sm:p-9 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold text-indigo-600">Your workspace</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Good to see you, {displayName}.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              Pick up a problem or start a fresh page. Your notes and solved steps stay together.
            </p>
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              disabled={isCreating || uploadProgress !== null}
              aria-expanded={menuOpen}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-lg leading-none">+</span>
              Upload Worksheet / New Notebook
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-3 w-72 rounded-2xl border border-white/80 bg-white/95 p-2 shadow-2xl shadow-slate-300/70 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={handleCreateNotebook}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-indigo-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-100 text-lg text-indigo-700">✎</span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">New notebook</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Start with a clean page</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setUploadModalOpen(true);
                  }}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-cyan-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-100 text-lg text-cyan-700">↑</span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Upload worksheet</span>
                    <span className="mt-0.5 block text-xs text-slate-500">PDF, DOCX, image, or video — up to 25 MB</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </section>

        {uploadProgress !== null && (
          <div className="mt-5 rounded-2xl border border-indigo-100 bg-white/75 p-4 shadow-sm" role="status">
            <div className="mb-2 flex justify-between text-sm font-medium">
              <span>Uploading worksheet…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {shownError && (
          <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-800" role="alert">
            <span>{shownError}</span>
            <button type="button" onClick={() => { setPageError(''); clearError(); }} className="font-semibold">Dismiss</button>
          </div>
        )}

        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Your notebooks</h2>
              <p className="mt-1 text-sm text-slate-500">{notebooks.length} {notebooks.length === 1 ? 'notebook' : 'notebooks'} saved</p>
            </div>
            <span className="hidden rounded-full border border-white bg-white/60 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm sm:inline-flex">
              Synced to your account
            </span>
          </div>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-52 animate-pulse rounded-3xl border border-white bg-white/60" />
              ))}
            </div>
          ) : notebooks.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-indigo-200 bg-white/45 px-6 py-14 text-center shadow-sm backdrop-blur-xl sm:py-20">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-indigo-100 to-cyan-100 text-3xl text-indigo-700">∑</div>
              <h3 className="mt-5 text-lg font-semibold">Your first notebook starts here</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Create a blank notebook or upload a worksheet to keep the question and your working together.
              </p>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="mt-6 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-md shadow-indigo-100 transition hover:-translate-y-0.5"
              >
                + Upload Worksheet / New Notebook
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {notebooks.map((notebook, index) => {
                const metadata = notebook.metadata || {};
                const pageCount = notebook.pageCount || notebook.pageOrder?.length || Object.keys(notebook.pages || {}).length;
                return (
                  <Link
                    key={notebook.id}
                    to={`/notebook/${notebook.id}`}
                    className="group relative overflow-hidden rounded-3xl border border-white/90 bg-white/65 p-5 shadow-lg shadow-slate-200/50 backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/70"
                  >
                    <div aria-hidden="true" className={`absolute -right-10 -top-12 h-36 w-36 rounded-full blur-3xl ${index % 2 === 0 ? 'bg-indigo-200/55' : 'bg-cyan-200/55'}`} />
                    <div className="relative flex items-start justify-between gap-4">
                      <span className={`grid h-12 w-12 place-items-center rounded-2xl text-xl ${index % 2 === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-cyan-100 text-cyan-700'}`}>▤</span>
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-500">{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
                    </div>
                    <h3 className="relative mt-7 truncate text-lg font-semibold tracking-tight group-hover:text-indigo-700">
                      {metadata.title || 'Untitled Notebook'}
                    </h3>
                    <p className="relative mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">
                      {notebook.sourceWorksheet?.fileName || 'Continue working through your math problems.'}
                    </p>
                    <div className="relative mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                      <span>Updated {formatDate(metadata.updatedAt || metadata.createdAt)}</span>
                      <span className="font-semibold text-indigo-600 transition group-hover:translate-x-1">Open →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <UploadWorksheetModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadComplete={(notebookId) => {
          setUploadModalOpen(false);
          navigate(`/notebook/${notebookId}`);
        }}
      />
    </main>
  );
}

