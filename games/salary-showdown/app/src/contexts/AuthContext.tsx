import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../lib/firebase';

const Ctx = createContext<{ uid: string | null; ready: boolean }>({ uid: null, ready: false });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ uid: null as string | null, ready: false });
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setState({ uid: u.uid, ready: true });
      else void signInAnonymously(auth).catch(() => {}); // anonymous by design — no accounts in a classroom; fire-and-forget must actually swallow rejections (TS `void` alone does not stop Node/Vitest from reporting an unhandled rejection when no emulator/network is reachable, e.g. plain unit runs)
    });
    return unsub;
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
