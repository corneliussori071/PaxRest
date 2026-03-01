import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, publicApi } from '@/lib/supabase';

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  loyalty_points_balance: number;
  total_spent: number;
  total_orders: number;
}

interface CustomerAuthState {
  profile: CustomerProfile | null;
  loading: boolean;
}

interface CustomerAuthActions {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: { email: string; password: string; name: string; phone: string; branchId: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useCustomerAuth = create<CustomerAuthState & CustomerAuthActions>()(
  persist(
    (set, get) => ({
      profile: null,
      loading: false,

      initialize: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await get().refreshProfile();
        }
      },

      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        if (data.session) {
          await get().refreshProfile();
        }
      },

      signUp: async ({ email, password, name, phone, branchId }) => {
        const res = await publicApi('/customer/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password, name, phone, branch_id: branchId }),
        });
        if (res.error) throw new Error(res.error.message);
        // Sign in immediately after creating account
        await get().signIn(email, password);
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ profile: null });
      },

      refreshProfile: async () => {
        set({ loading: true });
        try {
          const res = await publicApi<{ customer: CustomerProfile }>('/customer/me');
          if (res.data?.customer) {
            set({ profile: res.data.customer });
          }
        } catch {
          // ignore — user may not have a customers row yet
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: 'customer-auth',
      partialize: (s) => ({ profile: s.profile }),
    },
  ),
);
