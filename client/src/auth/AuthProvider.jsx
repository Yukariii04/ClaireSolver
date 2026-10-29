import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseConfigured, missingFirebaseConfig } from '../config/firebase.js';

const AuthContext = createContext(null);

const DEMO_USER = {
  uid: 'demo-student',
  displayName: 'Student (Local Demo)',
  email: 'student@demo.local',
  isDemo: true,
  getIdToken: async () => 'demo-token',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(isFirebaseConfigured ? null : DEMO_USER);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }

    return onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      },
      () => {
        setUser(null);
        setLoading(false);
      },
    );
  }, []);

  const value = useMemo(
    () => ({ user, loading, isFirebaseConfigured, missingFirebaseConfig }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

