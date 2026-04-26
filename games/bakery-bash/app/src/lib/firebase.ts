import { initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import {
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "bakery-bash-54d12",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);

// V6 fix (Apr 26): in dev, use a memory-only Firestore cache instead of the
// default IndexedDB-backed cache. Multi-tab dev playtesting (each tab a
// distinct UID via browserSessionPersistence on the auth side) was tripping
// the Firestore SDK's shared IndexedDB instance into "Unexpected state (ID:
// ca9)" assertion failures partway through a round. Once that fired the
// snapshot listener stopped delivering updates, so phase changes never
// reached the player tab and nobody navigated off /game/roster when the
// professor advanced. Memory cache is per-tab so it can't corrupt across
// tabs. Production keeps the default IndexedDB cache because real students
// play in a single tab and benefit from offline persistence.
export const db = import.meta.env.DEV
  ? initializeFirestore(app, { localCache: memoryLocalCache() })
  : getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);

// Point the client at the local Firebase emulator suite during dev so
// anonymous auth, Firestore, callable functions, and storage don't hit the
// real project. Idempotent across HMR — re-connecting the same emulator
// endpoint throws a warning but is harmless; we guard with a module-level
// flag so HMR re-runs are a no-op.
declare global {
  interface Window {
    __bakeryBashEmulatorsConnected?: boolean;
  }
}
if (
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  !window.__bakeryBashEmulatorsConnected
) {
  window.__bakeryBashEmulatorsConnected = true;
  // Anonymous Auth defaults to IndexedDB persistence, which is shared across
  // tabs — so opening tab 1 (Alice), tab 2 (Bob), tab 3 (Carol) in the same
  // browser sticks every "player" on the same UID and silently rewrites the
  // single roster doc with whichever displayName landed last. Switching to
  // sessionStorage in dev gives each tab its own UID (refresh keeps it,
  // tab close drops it) so multi-player playtesting in one browser actually
  // produces distinct players. Production keeps the default IndexedDB
  // persistence so a real student who closes their tab can come back.
  setPersistence(auth, browserSessionPersistence).catch((err) => {
    console.warn(
      "Could not set browserSessionPersistence — falling back to default",
      err,
    );
  });
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
  connectStorageEmulator(storage, "localhost", 9199);

  // V6 watchdog (Apr 26): if the Firestore SDK enters the "Unexpected
  // state (ID: ca9)" assertion-failure loop in dev, the entire client
  // becomes unusable — every subsequent onSnapshot/getDoc throws and
  // phase-change snapshots never propagate. Detect a sustained burst
  // of those assertions and reload the page; AuthProvider +
  // GameContext rehydrate the session so the user lands back on the
  // current phase with a fresh client. Production is unaffected
  // (single-tab playtest doesn't trigger the assertion). Threshold is
  // intentionally conservative (15 hits in a 5s window) so a single
  // transient error doesn't cause an unwanted reload.
  const ASSERTION_PATTERN = /INTERNAL ASSERTION FAILED.*ID: (ca9|b815)/;
  const RELOAD_THRESHOLD = 15;
  const RELOAD_WINDOW_MS = 5000;
  const assertionTimestamps: number[] = [];
  let reloadScheduled = false;
  const origConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origConsoleError(...args);
    if (reloadScheduled) return;
    let msg = "";
    for (const a of args) {
      if (typeof a === "string") msg += a;
      else if (a && typeof a === "object" && "message" in a) {
        msg += String((a as { message?: unknown }).message ?? "");
      }
    }
    if (!ASSERTION_PATTERN.test(msg)) return;
    const now = Date.now();
    assertionTimestamps.push(now);
    while (
      assertionTimestamps.length > 0 &&
      now - assertionTimestamps[0] > RELOAD_WINDOW_MS
    ) {
      assertionTimestamps.shift();
    }
    if (assertionTimestamps.length >= RELOAD_THRESHOLD) {
      reloadScheduled = true;
      origConsoleError(
        "🔄 Firestore SDK stuck in assertion-failure loop — reloading page in 1s to recover.",
      );
      setTimeout(() => window.location.reload(), 1000);
    }
  };
}
