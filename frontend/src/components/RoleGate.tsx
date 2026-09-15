import type { ReactNode } from "react";

import { useAuth } from "../auth/AuthContext";
import type { UserRole } from "../api/types";

const RANK: Record<UserRole, number> = { viewer: 0, editor: 1, admin: 2 };

/** Convenience only — hides controls the caller's role can't use. RLS is
 * the real gate; a hidden button here never means the write would have
 * been unsafe if shown. */
export function RoleGate({ minimum, children }: { minimum: UserRole; children: ReactNode }) {
  const { me } = useAuth();
  if (!me || RANK[me.role] < RANK[minimum]) return null;
  return <>{children}</>;
}
