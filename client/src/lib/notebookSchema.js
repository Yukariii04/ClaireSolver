export const PAPER_STYLES = ['grid', 'ruled', 'blank'];
export const PREFERRED_LANGUAGES = ['en-IN', 'hi-IN', 'gu-IN'];

export function createEmptyPage(pageNumberLabel = 'Page 1') {
  return {
    pageNumberLabel,
    questionImageUrl: '',
    questionSummary: '',
    userStrokes: '[]',
    aiSteps: [],
  };
}

export function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([, item]) => item);
  }
  return [];
}

export function pageLabelFromId(pageId) {
  const match = /^page_(\d+)([a-z]*)$/i.exec(pageId);
  if (!match) return pageId;
  return `Page ${match[1]}${match[2].toUpperCase()}`;
}

export function normalizePage(pageId, value = {}) {
  const page = value && typeof value === 'object' ? value : {};
  return {
    ...createEmptyPage(pageLabelFromId(pageId)),
    ...page,
    pageNumberLabel: page.pageNumberLabel || pageLabelFromId(pageId),
    questionImageUrl: page.questionImageUrl || '',
    questionSummary: page.questionSummary || '',
    userStrokes: typeof page.userStrokes === 'string' ? page.userStrokes : '[]',
    aiSteps: normalizeArray(page.aiSteps),
  };
}

function comparePageIds(left, right) {
  const parse = (id) => {
    const match = /^page_(\d+)([a-z]*)$/i.exec(id);
    return match ? [Number(match[1]), match[2].toLowerCase()] : [Number.MAX_SAFE_INTEGER, id];
  };
  const [leftNumber, leftSuffix] = parse(left);
  const [rightNumber, rightSuffix] = parse(right);
  return leftNumber - rightNumber || leftSuffix.localeCompare(rightSuffix);
}

export function normalizeNotebook(notebookId, value = {}) {
  const notebook = value && typeof value === 'object' ? value : {};
  const rawPages = notebook.pages && typeof notebook.pages === 'object' ? notebook.pages : {};
  const pages = Object.fromEntries(
    Object.entries(rawPages).map(([pageId, page]) => [pageId, normalizePage(pageId, page)]),
  );
  const storedOrder = normalizeArray(notebook.pageOrder).filter((pageId) => pages[pageId]);
  const remaining = Object.keys(pages)
    .filter((pageId) => !storedOrder.includes(pageId))
    .sort(comparePageIds);

  return {
    ...notebook,
    id: notebookId,
    metadata: notebook.metadata || {},
    pages,
    pageOrder: [...storedOrder, ...remaining],
  };
}

