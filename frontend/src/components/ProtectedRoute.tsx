import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { LoadingState } from "./LoadingState";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, configured } = useAuth();

  if (!configured) {
    return (
      <div className="config-error">
        Supabase is not configured. Copy <code>frontend/.env.example</code> to{" "}
        <code>frontend/.env</code> and set your project URL and anon key.
      </div>
    );
  }
  if (loading) return <LoadingState label="Checking session…" />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
