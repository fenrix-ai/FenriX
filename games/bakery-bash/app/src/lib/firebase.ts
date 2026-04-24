import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
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
export const db = getFirestore(app);
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
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
  connectStorageEmulator(storage, "localhost", 9199);
}
