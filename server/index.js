import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { Readable } from 'node:stream';
import { requireFirebaseAuth } from './firebaseAdmin.js';
import notebookUploadRouter from './routes/notebookUpload.js';

const app = express();
const port = Number(process.env.PORT || 5000);
const aiEngineUrl = (process.env.AI_ENGINE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const allowedOrigins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'app-backend' });
});

app.get('/api/auth/session', requireFirebaseAuth, (req, res) => {
  res.json({
    uid: req.firebaseUser.uid,
    email: req.firebaseUser.email || null,
    displayName: req.firebaseUser.name || null,
  });
});

// Worksheet upload → AI slicer → Firebase persistence
app.use('/api/notebooks/upload', notebookUploadRouter);

// Stream requests through so JSON, multipart uploads, and binary payloads can
// reach FastAPI without buffering the entire request in Express.
app.use('/api/ai', requireFirebaseAuth, async (req, res) => {
  const pathAndQuery = req.originalUrl.slice('/api/ai'.length) || '/';
  const upstreamUrl = `${aiEngineUrl}${pathAndQuery}`;
  const requestHeaders = new Headers();
  const requestHopByHop = new Set([
    'connection',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]);

  for (const [name, value] of Object.entries(req.headers)) {
    if (value && !requestHopByHop.has(name.toLowerCase())) {
      requestHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
  }

  const hasBody = !['GET', 'HEAD'].includes(req.method);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers: requestHeaders,
      body: hasBody ? req : undefined,
      ...(hasBody ? { duplex: 'half' } : {}),
      redirect: 'manual',
    });

    res.status(upstreamResponse.status);
    const responseHopByHop = new Set([
      ...requestHopByHop,
      'content-length',
      'content-encoding',
    ]);
    upstreamResponse.headers.forEach((value, name) => {
      if (!responseHopByHop.has(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });

    if (upstreamResponse.body) {
      Readable.fromWeb(upstreamResponse.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error('AI engine proxy failed:', error);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'AI engine is unavailable',
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
});

app.listen(port, () => {
  console.log(`App backend listening on http://localhost:${port}`);
});

