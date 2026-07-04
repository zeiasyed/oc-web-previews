import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  skip: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('sirat_user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, _password: string) => {
    const fakeUser: User = {
      uid: crypto.randomUUID(),
      email,
      displayName: email.split('@')[0],
    };
    setUser(fakeUser);
    localStorage.setItem('sirat_user', JSON.stringify(fakeUser));
  };

  const register = async (email: string, _password: string, name: string) => {
    const fakeUser: User = {
      uid: crypto.randomUUID(),
      email,
      displayName: name,
    };
    setUser(fakeUser);
    localStorage.setItem('sirat_user', JSON.stringify(fakeUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('sirat_user');
  };

  const skip = () => {
    const guestUser: User = {
      uid: 'guest',
      email: 'guest@sirat.app',
      displayName: 'Guest',
    };
    setUser(guestUser);
    localStorage.setItem('sirat_user', JSON.stringify(guestUser));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, skip }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
