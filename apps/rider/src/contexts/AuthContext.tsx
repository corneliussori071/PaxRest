import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase, api } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import toast from 'react-hot-toast';

interface RiderProfile {
  id: string;
  full_name: string;
  phone: string | null;
  vehicle_type: string;
  vehicle_plate: string | null;
  is_available: boolean;
  company_id: string;
  branch_id: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  rider: RiderProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshRider: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRider = useCallback(async () => {
    const res = await api<RiderProfile>('/delivery/my-profile');
    if (res.data) setRider(res.data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s) fetchRider();
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s) fetchRider();
      else setRider(null);
    });
    return () => subscription.unsubscribe();
  }, [fetchRider]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRider(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, rider, loading, signIn, signOut, refreshRider: fetchRider }}>
      {children}
    </AuthContext.Provider>
  );
}
