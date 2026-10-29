import { create } from 'zustand';
import {
  onValue,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  update,
} from 'firebase/database';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import { auth, database, isFirebaseConfigured, storage } from '../config/firebase.js';
import {
  createEmptyPage,
  normalizeArray,
  normalizeNotebook,
  normalizePage,
  pageLabelFromId,
  PAPER_STYLES,
  PREFERRED_LANGUAGES,
} from '../lib/notebookSchema.js';

const DEMO_NOTEBOOK_ID = 'demo-calculus-101';
const DEFAULT_DEMO_NOTEBOOK = {
  id: DEMO_NOTEBOOK_ID,
  metadata: {
    title: 'Calculus: Indefinite Integrals & Derivatives (Demo)',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    paperStyle: 'ruled',
    preferredLanguage: 'en-IN',
  },
  pageOrder: ['page_1'],
  pages: {
    page_1: {
      id: 'page_1',
      pageNumber: 1,
      paperStyle: 'ruled',
      questionText: 'Evaluate the indefinite integral: \\int (3x^2 - 4x + 5) \\, dx and find critical points.',
      questionImageUrl: null,
      questionBoundingBox: null,
      strokes: [],
      aiSteps: [],
      updatedAt: Date.now(),
    },
  },
  sourceWorksheet: null,
};

const MAX_WORKSHEET_BYTES = 25 * 1024 * 1024;
const IMAGE_CONTENT_TYPES = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function requireUser() {
  const user = auth?.currentUser;
  if (!user && !isFirebaseConfigured) {
    return { uid: 'demo-student', displayName: 'Student (Demo Mode)', email: 'demo@clairesolver.app' };
  }
  if (!user) throw new Error('Sign in before accessing notebooks.');
  return user;
}

function notebookPath(userId, notebookId) {
  return `notebooks/${userId}/${notebookId}`;
}

function notebookIndexPath(userId, notebookId) {
  return `notebookIndex/${userId}/${notebookId}`;
}

function validatePageId(pageId) {
  if (!/^page_\d+[a-z]*$/i.test(pageId)) {
    throw new Error('Invalid page id. Use a key such as page_1 or page_1b.');
  }
}

function makeSafeFileName(fileName) {
  return fileName.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'worksheet';
}

function incrementSuffix(suffix) {
  const chars = (suffix || 'a').split('');
  let index = chars.length - 1;
  while (index >= 0 && chars[index] === 'z') {
    chars[index] = 'a';
    index -= 1;
  }
  if (index < 0) chars.unshift('a');
  else chars[index] = String.fromCharCode(chars[index].charCodeAt(0) + 1);
  return chars.join('');
}

function nextContinuationId(afterPageId, pages) {
  const match = /^page_(\d+)([a-z]*)$/i.exec(afterPageId);
  if (!match) throw new Error('Continuation pages must be inserted after a valid page id.');

  let suffix = match[2] || 'a';
  let candidate;
  do {
    suffix = incrementSuffix(suffix);
    candidate = `page_${match[1]}${suffix}`;
  } while (pages[candidate]);
  return candidate;
}

function orderedPageIds(notebook) {
  return normalizeNotebook('ordering', notebook).pageOrder;
}

function normalizeAiStep(step, stepNumber) {
  return {
    step_number: Number.isInteger(step.step_number) ? step.step_number : stepNumber,
    canvas_latex: typeof step.canvas_latex === 'string' ? step.canvas_latex : '',
    tts_speech: typeof step.tts_speech === 'string' ? step.tts_speech : '',
    margin_note: typeof step.margin_note === 'string' ? step.margin_note : '',
    graph_action: step.graph_action ?? { type: 'none' },
  };
}

export const useNotebookStore = create((set, get) => ({
  notebooks: [],
  activeNotebook: null,
  activeNotebookId: null,
  isLoading: false,
  isCreating: false,
  uploadProgress: null,
  error: null,

  clearError: () => set({ error: null }),
  setActiveNotebookId: (activeNotebookId) => set({ activeNotebookId }),

  watchNotebooks: () => {
    const user = requireUser();
    set({ notebooks: [], isLoading: true, error: null });

    if (!database || !isFirebaseConfigured) {
      set({
        notebooks: [
          {
            id: DEMO_NOTEBOOK_ID,
            metadata: DEFAULT_DEMO_NOTEBOOK.metadata,
            pageCount: 1,
            sourceWorksheet: null,
          },
        ],
        isLoading: false,
        error: null,
      });
      return () => {};
    }

    return onValue(
      ref(database, `notebookIndex/${user.uid}`),
      (snapshot) => {
        const notebooks = [];
        snapshot.forEach((child) => {
          if (!child.key) return;
          const entry = child.val() || {};
          notebooks.push({
            id: child.key,
            metadata: {
              title: entry.title || 'Untitled Notebook',
              createdAt: entry.createdAt || null,
              updatedAt: entry.updatedAt || entry.createdAt || null,
              paperStyle: entry.paperStyle || 'grid',
              preferredLanguage: entry.preferredLanguage || 'en-IN',
            },
            pageCount: Number(entry.pageCount || 0),
            sourceWorksheet: entry.worksheetFileName
              ? { fileName: entry.worksheetFileName }
              : null,
          });
        });
        notebooks.sort(
          (left, right) =>
            Number(right.metadata.updatedAt || right.metadata.createdAt || 0) -
            Number(left.metadata.updatedAt || left.metadata.createdAt || 0),
        );
        set({ notebooks, isLoading: false, error: null });
      },
      (error) => set({ error: error.message, isLoading: false }),
    );
  },

  loadNotebook: (notebookId) => {
    const user = requireUser();
    set({ activeNotebookId: notebookId, activeNotebook: null, isLoading: true, error: null });

    if (!database || !isFirebaseConfigured) {
      const active = { ...DEFAULT_DEMO_NOTEBOOK, id: notebookId };
      set({ activeNotebook: active, isLoading: false });
      return () => {};
    }

    return onValue(
      ref(database, notebookPath(user.uid, notebookId)),
      (snapshot) => {
        const notebook = snapshot.exists()
          ? normalizeNotebook(notebookId, snapshot.val())
          : null;
        set({ activeNotebook: notebook, isLoading: false });
      },
      (error) => set({ error: error.message, isLoading: false }),
    );
  },

  createNotebook: async ({
    title = 'Untitled Notebook',
    paperStyle = 'grid',
    preferredLanguage = 'en-IN',
  } = {}) => {
    const user = requireUser();
    if (!PAPER_STYLES.includes(paperStyle)) throw new Error('Choose grid, ruled, or blank paper.');
    if (!PREFERRED_LANGUAGES.includes(preferredLanguage)) {
      throw new Error('Choose en-IN, hi-IN, or gu-IN as the preferred language.');
    }
    const notebookTitle = typeof title === 'string' ? title.trim().slice(0, 160) : '';

    if (!database || !isFirebaseConfigured) {
      const demoId = `demo-${Date.now()}`;
      const demoNb = {
        id: demoId,
        metadata: {
          title: notebookTitle || 'Untitled Notebook',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          paperStyle,
          preferredLanguage,
        },
        pages: {
          page_1: {
            id: 'page_1',
            pageNumber: 1,
            paperStyle,
            questionText: 'Start writing your math problem or summon Claire with the Ask Marker…',
            questionImageUrl: null,
            questionBoundingBox: null,
            strokes: [],
            aiSteps: [],
            updatedAt: Date.now(),
          },
        },
        pageOrder: ['page_1'],
        sourceWorksheet: null,
      };
      set((state) => ({
        notebooks: [
          { id: demoId, metadata: demoNb.metadata, pageCount: 1, sourceWorksheet: null },
          ...state.notebooks,
        ],
        activeNotebook: demoNb,
        activeNotebookId: demoId,
      }));
      return demoId;
    }

    const notebookRef = push(ref(database, `notebooks/${user.uid}`));
    if (!notebookRef.key) throw new Error('Could not allocate a notebook id.');
    const now = serverTimestamp();
    const metadata = {
      title: notebookTitle || 'Untitled Notebook',
      createdAt: now,
      updatedAt: now,
      paperStyle,
      preferredLanguage,
    };
    const initialNotebook = {
      metadata,
      pages: { page_1: createEmptyPage('Page 1') },
      pageOrder: ['page_1'],
    };

    set({ isCreating: true, error: null });
    try {
      await update(ref(database), {
        [notebookPath(user.uid, notebookRef.key)]: initialNotebook,
        [notebookIndexPath(user.uid, notebookRef.key)]: {
          ...metadata,
          pageCount: 1,
        },
      });
      return notebookRef.key;
    } catch (error) {
      set({ error: error.message });
      throw error;
    } finally {
      set({ isCreating: false });
    }
  },

  uploadWorksheet: async (file) => {
    const user = requireUser();
    if (!file) throw new Error('Choose a worksheet file to upload.');
    if (file.size <= 0 || file.size >= MAX_WORKSHEET_BYTES) {
      throw new Error('Worksheet files must be larger than 0 bytes and smaller than 25 MB.');
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const imageExtension = file.name.split('.').pop()?.toLowerCase();
    const isImage = file.type.startsWith('image/') || Boolean(IMAGE_CONTENT_TYPES[imageExtension]);
    if (!isPdf && !isImage) throw new Error('Upload a PDF or an image worksheet.');

    const contentType = isPdf
      ? 'application/pdf'
      : file.type.startsWith('image/')
        ? file.type
        : IMAGE_CONTENT_TYPES[imageExtension];
    const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    let notebookId;
    let worksheetRef;

    set({ uploadProgress: 0, error: null });
    try {
      notebookId = await get().createNotebook({ title: title || 'Worksheet Notebook' });
      const storagePath = `worksheets/${user.uid}/${notebookId}/${makeSafeFileName(file.name)}`;
      worksheetRef = storageRef(storage, storagePath);

      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(worksheetRef, file, { contentType });
        task.on(
          'state_changed',
          (snapshot) => {
            set({ uploadProgress: Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) });
          },
          reject,
          resolve,
        );
      });

      const downloadUrl = await getDownloadURL(worksheetRef);
      const uploadedAt = serverTimestamp();
      await update(ref(database), {
        [`${notebookPath(user.uid, notebookId)}/sourceWorksheet`]: {
          fileName: file.name,
          contentType,
          size: file.size,
          storagePath,
          downloadUrl,
          uploadedAt,
        },
        [`${notebookPath(user.uid, notebookId)}/metadata/updatedAt`]: uploadedAt,
        [`${notebookIndexPath(user.uid, notebookId)}/worksheetFileName`]: file.name,
        [`${notebookIndexPath(user.uid, notebookId)}/updatedAt`]: uploadedAt,
      });
      return notebookId;
    } catch (error) {
      if (worksheetRef) {
        try {
          await deleteObject(worksheetRef);
        } catch {
          // The upload may not have created an object; keep the original error.
        }
      }
      if (notebookId) {
        try {
          await update(ref(database), {
            [notebookPath(user.uid, notebookId)]: null,
            [notebookIndexPath(user.uid, notebookId)]: null,
          });
        } catch {
          // Keep the original upload error visible to the user.
        }
      }
      set({ error: error.message });
      throw error;
    } finally {
      set({ uploadProgress: null });
    }
  },

  uploadQuestionImage: async (notebookId, pageId, croppedImage) => {
    const user = requireUser();
    validatePageId(pageId);
    if (!croppedImage || !croppedImage.type?.startsWith('image/')) {
      throw new Error('Choose a cropped question image.');
    }
    if (croppedImage.size <= 0 || croppedImage.size >= 10 * 1024 * 1024) {
      throw new Error('Question images must be larger than 0 bytes and smaller than 10 MB.');
    }

    const storagePath = `question-images/${user.uid}/${notebookId}/${pageId}/${makeSafeFileName(croppedImage.name || 'question.png')}`;
    const questionImageRef = storageRef(storage, storagePath);
    set({ uploadProgress: 0, error: null });
    try {
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(questionImageRef, croppedImage, {
          contentType: croppedImage.type,
        });
        task.on(
          'state_changed',
          (snapshot) => {
            set({ uploadProgress: Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) });
          },
          reject,
          resolve,
        );
      });

      const questionImageUrl = await getDownloadURL(questionImageRef);
      const updatedAt = serverTimestamp();
      await update(ref(database), {
        [`${notebookPath(user.uid, notebookId)}/pages/${pageId}/questionImageUrl`]: questionImageUrl,
        [`${notebookPath(user.uid, notebookId)}/metadata/updatedAt`]: updatedAt,
        [`${notebookIndexPath(user.uid, notebookId)}/updatedAt`]: updatedAt,
      });
      return questionImageUrl;
    } catch (error) {
      try {
        await deleteObject(questionImageRef);
      } catch {
        // The object may not have been uploaded; preserve the original error.
      }
      set({ error: error.message });
      throw error;
    } finally {
      set({ uploadProgress: null });
    }
  },

  savePageStrokes: async (notebookId, pageId, strokes) => {
    const user = requireUser();
    validatePageId(pageId);
    if (!Array.isArray(strokes)) throw new Error('Strokes must be an array.');

    const serializedStrokes = JSON.stringify(strokes);

    if (database && isFirebaseConfigured) {
      const updatedAt = serverTimestamp();
      await update(ref(database), {
        [`${notebookPath(user.uid, notebookId)}/pages/${pageId}/userStrokes`]: serializedStrokes,
        [`${notebookPath(user.uid, notebookId)}/metadata/updatedAt`]: updatedAt,
        [`${notebookIndexPath(user.uid, notebookId)}/updatedAt`]: updatedAt,
      });
    }

    set((state) => {
      if (state.activeNotebookId !== notebookId || !state.activeNotebook) return {};
      const currentPage = state.activeNotebook.pages[pageId] || createEmptyPage(pageLabelFromId(pageId));
      return {
        activeNotebook: {
          ...state.activeNotebook,
          metadata: { ...state.activeNotebook.metadata, updatedAt: Date.now() },
          pages: {
            ...state.activeNotebook.pages,
            [pageId]: { ...currentPage, userStrokes: serializedStrokes },
          },
        },
      };
    });
  },

  savePageStudentLines: async (notebookId, pageId, lines) => {
    const user = requireUser();
    validatePageId(pageId);
    const safeLines = Array.isArray(lines) ? lines : [];

    if (database && isFirebaseConfigured) {
      const updatedAt = serverTimestamp();
      await update(ref(database), {
        [`${notebookPath(user.uid, notebookId)}/pages/${pageId}/studentLines`]: safeLines,
        [`${notebookPath(user.uid, notebookId)}/metadata/updatedAt`]: updatedAt,
        [`${notebookIndexPath(user.uid, notebookId)}/updatedAt`]: updatedAt,
      });
    }

    set((state) => {
      if (state.activeNotebookId !== notebookId || !state.activeNotebook) return {};
      const currentPage = state.activeNotebook.pages[pageId] || createEmptyPage(pageLabelFromId(pageId));
      return {
        activeNotebook: {
          ...state.activeNotebook,
          metadata: { ...state.activeNotebook.metadata, updatedAt: Date.now() },
          pages: {
            ...state.activeNotebook.pages,
            [pageId]: { ...currentPage, studentLines: safeLines },
          },
        },
      };
    });
  },

  appendAiStep: async (notebookId, pageId, step) => {
    const user = requireUser();
    validatePageId(pageId);
    if (!step || typeof step !== 'object') throw new Error('Provide a solved step object.');

    if (!database || !isFirebaseConfigured) {
      let savedStep = null;
      set((state) => {
        if (!state.activeNotebook) return {};
        const page = state.activeNotebook.pages?.[pageId] || createEmptyPage(pageLabelFromId(pageId));
        const currentSteps = Array.isArray(page.aiSteps) ? page.aiSteps : [];
        savedStep = normalizeAiStep(step, currentSteps.length + 1);
        return {
          activeNotebook: {
            ...state.activeNotebook,
            metadata: { ...state.activeNotebook.metadata, updatedAt: Date.now() },
            pages: {
              ...state.activeNotebook.pages,
              [pageId]: {
                ...page,
                aiSteps: [...currentSteps, savedStep],
                updatedAt: Date.now(),
              },
            },
          },
        };
      });
      return savedStep;
    }

    const pageRef = ref(database, `${notebookPath(user.uid, notebookId)}/pages/${pageId}`);
    const transaction = await runTransaction(pageRef, (currentValue) => {
      const page = normalizePage(pageId, currentValue || {});
      const steps = normalizeArray(page.aiSteps);
      return { ...page, aiSteps: [...steps, normalizeAiStep(step, steps.length + 1)] };
    });
    if (!transaction.committed) throw new Error('The AI step could not be saved.');

    const updatedAt = serverTimestamp();
    await update(ref(database), {
      [`${notebookPath(user.uid, notebookId)}/metadata/updatedAt`]: updatedAt,
      [`${notebookIndexPath(user.uid, notebookId)}/updatedAt`]: updatedAt,
    });
    const savedPage = normalizePage(pageId, transaction.snapshot.val());
    set((state) => {
      if (state.activeNotebookId !== notebookId || !state.activeNotebook) return {};
      return {
        activeNotebook: {
          ...state.activeNotebook,
          metadata: { ...state.activeNotebook.metadata, updatedAt: Date.now() },
          pages: { ...state.activeNotebook.pages, [pageId]: savedPage },
        },
      };
    });
    return savedPage.aiSteps[savedPage.aiSteps.length - 1];
  },

  insertContinuationPage: async (notebookId, afterPageId, pageDraft = {}) => {
    const user = requireUser();
    validatePageId(afterPageId);
    const draft = pageDraft && typeof pageDraft === 'object' ? pageDraft : {};

    if (!database || !isFirebaseConfigured) {
      let insertedPageId = null;
      set((state) => {
        if (!state.activeNotebook) return {};
        const pages = state.activeNotebook.pages || {};
        insertedPageId = nextContinuationId(afterPageId, pages);
        const continuation = {
          id: insertedPageId,
          pageNumber: pages[afterPageId]?.pageNumber || 1,
          paperStyle: pages[afterPageId]?.paperStyle || state.activeNotebook.metadata?.paperStyle || 'ruled',
          questionText: 'Continuation sheet…',
          isContinuation: true,
          parentPageId: afterPageId,
          strokes: [],
          aiSteps: [],
          updatedAt: Date.now(),
        };
        const pageOrder = [...(state.activeNotebook.pageOrder || ['page_1'])];
        const afterIndex = pageOrder.indexOf(afterPageId);
        if (afterIndex >= 0) pageOrder.splice(afterIndex + 1, 0, insertedPageId);
        else pageOrder.push(insertedPageId);

        return {
          activeNotebook: {
            ...state.activeNotebook,
            pageOrder,
            pages: { ...pages, [insertedPageId]: continuation },
          },
        };
      });
      return insertedPageId;
    }

    const transaction = await runTransaction(notebookRef, (currentValue) => {
      if (!currentValue || typeof currentValue !== 'object') return;
      const pages = currentValue.pages && typeof currentValue.pages === 'object'
        ? currentValue.pages
        : {};
      const pageOrder = orderedPageIds({ ...currentValue, pages });
      const afterIndex = pageOrder.indexOf(afterPageId);
      if (afterIndex < 0) return;

      insertedPageId = nextContinuationId(afterPageId, pages);
      const continuation = {
        pageNumberLabel: draft.pageNumberLabel || pageLabelFromId(insertedPageId),
        questionImageUrl: draft.questionImageUrl || '',
        questionSummary: draft.questionSummary || '',
        userStrokes: Array.isArray(draft.userStrokes)
          ? JSON.stringify(draft.userStrokes)
          : typeof draft.userStrokes === 'string'
            ? draft.userStrokes
            : '[]',
        aiSteps: normalizeArray(draft.aiSteps),
      };
      const nextPageOrder = [...pageOrder];
      nextPageOrder.splice(afterIndex + 1, 0, insertedPageId);

      return {
        ...currentValue,
        metadata: { ...currentValue.metadata, updatedAt: Date.now() },
        pages: { ...pages, [insertedPageId]: continuation },
        pageOrder: nextPageOrder,
      };
    });

    if (!transaction.committed || !insertedPageId) {
      throw new Error('Could not insert a continuation after the selected page.');
    }

    const notebook = normalizeNotebook(notebookId, transaction.snapshot.val());
    await update(ref(database), {
      [`${notebookIndexPath(user.uid, notebookId)}/updatedAt`]: serverTimestamp(),
      [`${notebookIndexPath(user.uid, notebookId)}/pageCount`]: notebook.pageOrder.length,
    });
    set((state) => ({
      activeNotebook:
        state.activeNotebookId === notebookId ? notebook : state.activeNotebook,
      notebooks: state.notebooks.map((item) => (item.id === notebookId ? notebook : item)),
    }));
    return insertedPageId;
  },
}));

