import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { api, setAuthToken } from "../api/client";
import type { Me } from "../api/types";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

interface AuthState {
  session: Session | null;
  me: Me | null;
  loading: boolean;
  configured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Role is never read from the JWT client-side — it's asked of the
  // backend, which resolves it via the same get_auth_role() RLS itself
  // uses (GET /api/v1/me). The UI gates on the backend's answer, and every
  // actual write is re-checked by RLS regardless of what this call returns.
  const loadMe = async () => {
    try {
      setMe(await api.get<Me>("/api/v1/me"));
    } catch {
      setMe(null);
    }
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setAuthToken(data.session?.access_token ?? null);
      if (data.session) await loadMe();
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthToken(newSession?.access_token ?? null);
      if (newSession) {
        void loadMe();
      } else {
        setMe(null);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signInWithPassword: AuthState["signInWithPassword"] = async (email, password) => {
    if (!supabase) return { error: "Supabase is not configured — see frontend/.env.example" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUpWithPassword: AuthState["signUpWithPassword"] = async (email, password, fullName) => {
    if (!supabase) return { error: "Supabase is not configured — see frontend/.env.example" };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        me,
        loading,
        configured: isSupabaseConfigured,
        signInWithPassword,
        signUpWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
