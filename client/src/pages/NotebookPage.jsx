import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useNotebookStore } from '../store/useNotebookStore.js';

export default function NotebookPage() {
  const { id } = useParams();
  const notebook = useNotebookStore((state) => state.activeNotebook);
  const isLoading = useNotebookStore((state) => state.isLoading);
  const error = useNotebookStore((state) => state.error);
  const loadNotebook = useNotebookStore((state) => state.loadNotebook);

  useEffect(() => loadNotebook(id), [id, loadNotebook]);

  return (
    <main className="min-h-screen bg-[#f3f5fb] px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/dashboard" className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">← All notebooks</Link>
        {isLoading ? (
          <div className="mt-8 animate-pulse rounded-3xl border border-white bg-white/70 p-10 text-slate-400">Loading notebook…</div>
        ) : error ? (
          <div className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800" role="alert">{error}</div>
        ) : !notebook ? (
          <div className="mt-8 rounded-3xl border border-white bg-white/70 p-10">
            <h1 className="text-2xl font-semibold">Notebook not found</h1>
            <p className="mt-2 text-sm text-slate-500">It may have been removed or may belong to another account.</p>
          </div>
        ) : (
          <>
            <header className="mt-8 rounded-3xl border border-white bg-white/70 p-6 shadow-lg shadow-indigo-100/40 backdrop-blur-xl sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">{notebook.metadata.paperStyle || 'grid'} paper</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{notebook.metadata.title}</h1>
              <p className="mt-2 text-sm text-slate-500">Preferred language: {notebook.metadata.preferredLanguage || 'en-IN'}</p>
            </header>
            <section className="mt-6 space-y-4">
              {notebook.pageOrder.map((pageId) => {
                const page = notebook.pages[pageId];
                return (
                  <article key={pageId} className="rounded-3xl border border-white bg-white/70 p-6 shadow-md shadow-slate-200/50 backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="font-semibold">{page.pageNumberLabel}</h2>
                      <span className="text-xs text-slate-500">{page.aiSteps.length} solved steps</span>
                    </div>
                    {page.questionSummary && <p className="mt-3 text-sm text-slate-600">{page.questionSummary}</p>}
                    {notebook.sourceWorksheet?.fileName && pageId === 'page_1' && (
                      <p className="mt-3 text-xs text-slate-500">Source worksheet: {notebook.sourceWorksheet.fileName}</p>
                    )}
                    <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      Notebook canvas and tutor steps will appear here in the next step.
                    </p>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
