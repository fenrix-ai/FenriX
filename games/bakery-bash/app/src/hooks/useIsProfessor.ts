import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

/**
 * Returns the resolution state of the `professor` custom claim for the
 * current Firebase user.
 *
 * `loading=true` means we are still waiting on auth or the token result.
 * Callers should hold rendering until `loading=false` to avoid a brief
 * "not authorized" flash before the claim resolves.
 *
 * Mirrors the `isProfessor()` helper in `firestore.rules` (line 16): the
 * client-side gate matches the server-side authorization boundary, so a
 * non-professor visitor cannot meaningfully interact with surfaces that
 * write to professor-only collections.
 */
export function useIsProfessor(): { isProfessor: boolean; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const [isProfessor, setIsProfessor] = useState(false);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    if (!user) {
      setIsProfessor(false);
      setResolving(false);
      return;
    }
    setResolving(true);
    user
      .getIdTokenResult()
      .then((result) => {
        if (cancelled) return;
        setIsProfessor(result.claims.professor === true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsProfessor(false);
      })
      .finally(() => {
        if (cancelled) return;
        setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { isProfessor, loading: authLoading || resolving };
}
