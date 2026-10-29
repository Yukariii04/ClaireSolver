import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredConfig = [
  'apiKey',
  'authDomain',
  'databaseURL',
  'projectId',
  'storageBucket',
  'appId',
];
const missingConfig = requiredConfig.filter((key) => {
  const value = firebaseConfig[key];
  return !value || value.includes('your-project') || value.startsWith('your-');
});

export const isFirebaseConfigured = missingConfig.length === 0;
export const missingFirebaseConfig = missingConfig;

let appInstance = null;
let authInstance = null;
let googleProviderInstance = null;
let databaseInstance = null;
let storageInstance = null;

if (isFirebaseConfigured) {
  try {
    appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(appInstance);
    googleProviderInstance = new GoogleAuthProvider();
    googleProviderInstance.setCustomParameters({ prompt: 'select_account' });
    databaseInstance = getDatabase(appInstance, firebaseConfig.databaseURL);
    storageInstance = getStorage(appInstance);
  } catch (error) {
    console.error('[ClaireSolver] Failed to initialize Firebase:', error);
  }
} else {
  console.warn(
    `[ClaireSolver] Firebase is not yet configured (${missingConfig.join(', ')}). ` +
      'App running in Offline / Demo Mode. Fill client/.env to connect live Firebase.'
  );
}

export const firebaseApp = appInstance;
export const auth = authInstance;
export const googleProvider = googleProviderInstance;
export const database = databaseInstance;
export const storage = storageInstance;


