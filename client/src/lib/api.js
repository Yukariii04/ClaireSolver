import { auth } from '../config/firebase.js';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

export async function authenticatedFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before calling the app backend.');

  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers,
  });
}

