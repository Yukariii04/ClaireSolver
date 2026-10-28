import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotebookPage from './pages/NotebookPage.jsx';

function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f5fb] px-5 text-center text-slate-900">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">404</p>
        <h1 className="mt-2 text-3xl font-semibold">That page does not exist</h1>
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-semibold text-indigo-700 underline">Return to dashboard</Link>
      </div>
    </main>
  );
}

function AuthLoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0c1022] text-white">
      <div className="flex items-center gap-3 text-sm text-slate-300" role="status">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300" />
        Checking your account…
      </div>
    </main>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/notebook/:id" element={<RequireAuth><NotebookPage /></RequireAuth>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

