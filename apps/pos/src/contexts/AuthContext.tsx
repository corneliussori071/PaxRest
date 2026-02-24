import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile, Company, Branch } from '@paxrest/shared-types';
import { supabase, api, publicApi } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  company: Company | null;
  branches: Branch[];
  activeBranchId: string | null;
  loading: boolean;
  initialized: boolean;
}

interface AuthContextValue extends AuthState {
  activeBranch: Branch | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: {
    email: string; password: string; fullName: string;
    companyName: string; phone?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  switchBranch: (branchId: string) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null, user: null, profile: null, company: null,
    branches: [], activeBranchId: null, loading: true, initialized: false,
  });

  const fetchProfile = useCallback(async () => {
    try {
      const data = await api<{
        profile: Profile; company: Company; branches: Branch[];
      }>('auth', 'profile');
      setState((s) => ({
        ...s,
        profile: data.profile,
        company: data.company,
        branches: data.branches,
        activeBranchId: s.activeBranchId ?? data.profile.active_branch_id ?? data.profile.branch_ids?.[0] ?? null,
        loading: false,
      }));
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((s) => ({
        ...s,
        session,
        user: session?.user ?? null,
        initialized: true,
        loading: !!session,
      }));
      if (session) fetchProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({
        ...s,
        session,
        user: session?.user ?? null,
        loading: !!session && !s.profile,
      }));
      if (session && !state.profile) fetchProfile();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await fetchProfile();
  };

  const signUp = async (data: {
    email: string; password: string; fullName: string;
    companyName: string; phone?: string;
  }) => {
    // Call register edge function (handles user creation server-side)
    await publicApi('auth', 'register', {
      body: {
        email: data.email,
        password: data.password,
        company_name: data.companyName,
        full_name: data.fullName,
        phone: data.phone,
      },
    });

    // Sign in the newly created user
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (signInErr) throw signInErr;

    await fetchProfile();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setState({
      session: null, user: null, profile: null, company: null,
      branches: [], activeBranchId: null, loading: false, initialized: true,
    });
  };

  const switchBranch = (branchId: string) => {
    setState((s) => ({ ...s, activeBranchId: branchId }));
    // Persist to server
    api('auth', 'switch-branch', { body: { branch_id: branchId } }).catch(console.error);
  };

  const refreshProfile = fetchProfile;

  const activeBranch = state.branches.find((b) => b.id === state.activeBranchId);

  return (
    <AuthContext.Provider value={{ ...state, activeBranch, signIn, signUp, signOut, switchBranch, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
