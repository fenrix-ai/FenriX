import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator, getFirestore, initializeFirestore, memoryLocalCache,
} from 'firebase/firestore';
import {
  browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence,
} from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'fake-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'localhost',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'salary-showdown-dev',
};

export const app = initializeApp(firebaseConfig);

// Dev/test: memory-only Firestore cache. Multi-tab dev playtesting (each tab a
// distinct anonymous uid via session persistence) corrupts the SDK's shared
// IndexedDB cache; memory cache is per-tab and cannot. Production keeps the
// default persistent cache. The try/catch is the HMR guard: the app singleton
// survives hot reloads, and a second initializeFirestore on it throws.
export const db = (() => {
  if (!import.meta.env.DEV) return getFirestore(app);
  try {
    return initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch {
    return getFirestore(app);
  }
})();

export const auth = getAuth(app);
// Callables live in us-west1, co-located with the Firestore database (locked
// decision 2026-07-25). In PROD the region shapes the callable URL
// (https://us-west1-<project>.cloudfunctions.net/<fn>). In DEV,
// connectFunctionsEmulator below still overrides the origin — the SDK builds
// ${emulatorOrigin}/${projectId}/${region}/${fn}, so the region only has to
// match what the functions emulator registered, which it does now that
// game.js pins setGlobalOptions({ region: 'us-west1' }).
export const functions = getFunctions(app, 'us-west1');

declare global {
  // eslint-disable-next-line no-var
  var __SS_EMULATORS_CONNECTED__: boolean | undefined;
}

if (import.meta.env.DEV && !globalThis.__SS_EMULATORS_CONNECTED__) {
  globalThis.__SS_EMULATORS_CONNECTED__ = true; // HMR guard: connect once per tab
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
  connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  // Per-tab identity: session persistence gives each browser tab its own
  // anonymous uid, so one laptop can play GM, Scout, and Coach in three tabs.
  void setPersistence(auth, browserSessionPersistence);
}
