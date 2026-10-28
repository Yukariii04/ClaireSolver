import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getDatabase, ServerValue } from 'firebase-admin/database';
import { getStorage } from 'firebase-admin/storage';
import { requireFirebaseAuth } from '../firebaseAdmin.js';

const router = express.Router();

const aiEngineUrl = (process.env.AI_ENGINE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const VALID_PAPER_STYLES = ['grid', 'ruled', 'blank'];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ACCEPTED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/webm',
]);

const ACCEPTED_EXTENSIONS = /\.(pdf|docx|jpe?g|png|webp|webm)$/i;

// ---------------------------------------------------------------------------
// Multer config — memory storage, single file
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (ACCEPTED_MIMES.has(file.mimetype) || ACCEPTED_EXTENSIONS.test(file.originalname)) {
      return cb(null, true);
    }
    return cb(
      Object.assign(new Error('Unsupported file type. Upload a PDF, DOCX, image, or WebM.'), {
        status: 400,
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// Firebase Admin — lazily initialise for DB + Storage
// ---------------------------------------------------------------------------

const ADMIN_APP_NAME = 'math-homework-notebook-admin';

function getAdminApp() {
  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) return existing;

  return initializeApp(
    {
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      projectId: process.env.FIREBASE_PROJECT_ID,
    },
    ADMIN_APP_NAME,
  );
}

function adminDb() {
  return getDatabase(getAdminApp());
}

function adminBucket() {
  return getStorage(getAdminApp()).bucket();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSafeFileName(name) {
  return name
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-100) || 'worksheet';
}

function titleFromFilename(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Worksheet Notebook';
}

async function uploadImageBuffer(bucket, storagePath, buffer) {
  const file = bucket.file(storagePath);
  const token = crypto.randomUUID();

  await file.save(buffer, {
    contentType: 'image/png',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });

  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
}

// ---------------------------------------------------------------------------
// POST /  (mounted at /api/notebooks/upload)
// ---------------------------------------------------------------------------

router.post(
  '/',
  requireFirebaseAuth,
  (req, res, next) => {
    upload.single('worksheet')(req, res, (err) => {
      if (err) {
        const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
        return res.status(status).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const uid = req.firebaseUser.uid;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No worksheet file was uploaded.' });
      }

      // Validate paperStyle
      const paperStyle = VALID_PAPER_STYLES.includes(req.body.paperStyle)
        ? req.body.paperStyle
        : 'grid';

      // -------------------------------------------------------------------
      // 1. Forward file to the AI engine slicer
      // -------------------------------------------------------------------
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([file.buffer], { type: file.mimetype }),
        file.originalname,
      );

      let aiResponse;
      try {
        aiResponse = await fetch(`${aiEngineUrl}/slice-worksheet/`, {
          method: 'POST',
          body: formData,
        });
      } catch (fetchErr) {
        console.error('AI engine unreachable:', fetchErr.message);
        return res.status(502).json({ error: 'The AI engine is not reachable.' });
      }

      if (!aiResponse.ok) {
        const detail = await aiResponse.text().catch(() => '');
        console.error('AI engine returned %d: %s', aiResponse.status, detail);
        return res.status(aiResponse.status >= 500 ? 502 : aiResponse.status).json({
          error: 'The AI engine could not process the worksheet.',
          detail: process.env.NODE_ENV === 'development' ? detail : undefined,
        });
      }

      const { questions } = await aiResponse.json();

      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(422).json({ error: 'No questions were detected in the worksheet.' });
      }

      // -------------------------------------------------------------------
      // 2. Upload each cropped question image to Cloud Storage
      // -------------------------------------------------------------------
      const db = adminDb();
      const bucket = adminBucket();
      const notebookRef = db.ref(`notebooks/${uid}`).push();
      const notebookId = notebookRef.key;
      const title = titleFromFilename(file.originalname);

      const pages = {};
      const pageOrder = [];

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const pageId = `page_${i + 1}`;
        const imageBuffer = Buffer.from(q.image_base64, 'base64');
        const storagePath = `question-images/${uid}/${notebookId}/${pageId}/question.png`;

        const downloadUrl = await uploadImageBuffer(bucket, storagePath, imageBuffer);

        pages[pageId] = {
          pageNumberLabel: `Page ${i + 1}`,
          questionImageUrl: downloadUrl,
          questionSummary: q.question_summary || '',
          userStrokes: '[]',
          aiSteps: [],
        };
        pageOrder.push(pageId);
      }

      // -------------------------------------------------------------------
      // 3. Write notebook + index to Realtime Database
      // -------------------------------------------------------------------
      const now = ServerValue.TIMESTAMP;

      const notebook = {
        metadata: {
          title,
          createdAt: now,
          updatedAt: now,
          paperStyle,
          preferredLanguage: 'en-IN',
        },
        pages,
        pageOrder,
        sourceWorksheet: {
          fileName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: now,
        },
      };

      const indexEntry = {
        title,
        createdAt: now,
        updatedAt: now,
        paperStyle,
        preferredLanguage: 'en-IN',
        pageCount: questions.length,
        worksheetFileName: file.originalname,
      };

      await db.ref().update({
        [`notebooks/${uid}/${notebookId}`]: notebook,
        [`notebookIndex/${uid}/${notebookId}`]: indexEntry,
      });

      return res.status(201).json({
        notebookId,
        questionCount: questions.length,
      });
    } catch (error) {
      console.error('Notebook upload failed:', error);
      return res.status(500).json({
        error: 'An unexpected error occurred while processing the worksheet.',
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

export default router;

