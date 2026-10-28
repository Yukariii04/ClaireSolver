import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const appName = 'math-homework-notebook-admin';
let adminAuth;

function getFirebaseAdminAuth() {
  if (adminAuth) return adminAuth;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (
    !projectId ||
    !clientEmail ||
    !privateKey ||
    privateKey.includes('replace-with-service-account-key')
  ) {
    const error = new Error('Firebase Admin credentials are not configured.');
    error.code = 'FIREBASE_ADMIN_NOT_CONFIGURED';
    throw error;
  }

  try {
    const app =
      getApps().find((candidate) => candidate.name === appName) ||
      initializeApp(
        {
          credential: cert({ projectId, clientEmail, privateKey }),
          projectId,
        },
        appName,
      );
    adminAuth = getAuth(app);
    return adminAuth;
  } catch (cause) {
    const error = new Error('Firebase Admin credentials could not be initialized.');
    error.code = 'FIREBASE_ADMIN_CONFIGURATION_ERROR';
    error.cause = cause;
    throw error;
  }
}

export async function requireFirebaseAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    return res.status(401).json({ error: 'A Firebase ID token is required.' });
  }

  try {
    req.firebaseUser = await getFirebaseAdminAuth().verifyIdToken(match[1], true);
    return next();
  } catch (error) {
    if (String(error.code || '').startsWith('FIREBASE_ADMIN_')) {
      console.error(error.message, error.cause?.message || '');
      return res.status(503).json({ error: 'Firebase Admin authentication is not configured.' });
    }
    return res.status(401).json({ error: 'The Firebase session is invalid or expired.' });
  }
}

