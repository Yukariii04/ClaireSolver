import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useNotebookStore } from '../store/useNotebookStore.js';
import NotebookWorkspace from '../components/NotebookWorkspace.jsx';

export default function NotebookPage() {
  const { id } = useParams();
  const notebook = useNotebookStore((state) => state.activeNotebook);
  const isLoading = useNotebookStore((state) => state.isLoading);
  const error = useNotebookStore((state) => state.error);
  const loadNotebook = useNotebookStore((state) => state.loadNotebook);

  useEffect(() => loadNotebook(id), [id, loadNotebook]);

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5fb]">
        <div className="flex items-center gap-3 text-sm text-slate-400" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
          Loading notebook…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5fb] px-5">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800" role="alert">
          <p className="text-sm font-medium">{error}</p>
        </div>
      </main>
    );
  }

  if (!notebook) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f5fb] px-5">
        <div className="rounded-3xl border border-white bg-white/70 p-10 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Notebook not found</h1>
          <p className="mt-2 text-sm text-slate-500">
            It may have been removed or may belong to another account.
          </p>
        </div>
      </main>
    );
  }

  return <NotebookWorkspace notebook={notebook} notebookId={id} />;
}
