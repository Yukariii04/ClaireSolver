import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '../config/firebase.js';
import { authErrorMessage } from '../lib/authErrors.js';

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.38l-3.24-2.53c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.13H3.06v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84v-2.6H3.06a10 10 0 0 0 0 9.04l3.35-2.6Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.52l2.87-2.87C16.96 2.98 14.7 2 12 2a10 10 0 0 0-8.94 5.48l3.35 2.6C7.2 7.71 9.4 5.95 12 5.95Z" />
    </svg>
  );
}

export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const destination = location.state?.from?.pathname || '/dashboard';

  async function handleEmailSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      if (isCreatingAccount) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      navigate(destination, { replace: true });
    } catch (authError) {
      setError(authErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setIsSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate(destination, { replace: true });
    } catch (authError) {
      setError(authErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#0c1022] px-5 py-12 text-white sm:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-500/35 blur-[100px]" />
        <div className="absolute -bottom-40 -right-20 h-[30rem] w-[30rem] rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-[110px]" />
      </div>

      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/30 backdrop-blur-2xl lg:grid-cols-[1fr_0.92fr]">
        <section className="hidden flex-col justify-between border-r border-white/10 p-12 lg:flex">
          <Link to="/login" className="flex items-center gap-3 text-sm font-semibold tracking-wide text-white/90">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-lg">∑</span>
            Gnani Math Notebook
          </Link>
          <div className="max-w-md py-12">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-xs font-medium text-cyan-100">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              A calmer way to work through math
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Think it through, one step at a time.
            </h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-slate-300">
              Keep your worksheets, handwritten work, and tutor explanations together in one notebook.
            </p>
          </div>
          <p className="text-xs text-slate-400">Your work stays in your private notebook space.</p>
        </section>

        <section className="p-6 sm:p-10 lg:p-12">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-lg">∑</span>
            <span className="text-sm font-semibold tracking-wide">Gnani Math Notebook</span>
          </div>
          <div className="mx-auto max-w-md">
            <p className="text-sm font-medium text-cyan-200">Welcome to your workspace</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {isCreatingAccount ? 'Create your account' : 'Sign in'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {isCreatingAccount
                ? 'Start a notebook and keep your progress in one place.'
                : 'Pick up where you left off in your math notebook.'}
            </p>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg shadow-black/10 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleMark />
              Continue with Google
            </button>

            <div className="my-6 flex items-center gap-4 text-xs text-slate-400">
              <span className="h-px flex-1 bg-white/10" />
              or continue with email
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <label className="block text-sm font-medium text-slate-200">
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
                />
              </label>
              <label className="block text-sm font-medium text-slate-200">
                Password
                <input
                  type="password"
                  autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
                />
              </label>

              {error && (
                <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-400 to-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Please wait…' : isCreatingAccount ? 'Create account' : 'Sign in with email'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-300">
              {isCreatingAccount ? 'Already have an account?' : 'New to the notebook?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsCreatingAccount((value) => !value);
                  setError('');
                }}
                className="font-semibold text-cyan-200 underline decoration-cyan-200/40 underline-offset-4 hover:text-white"
              >
                {isCreatingAccount ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

