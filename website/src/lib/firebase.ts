import type { FirebaseApp } from 'firebase/app'
import type { Firestore } from 'firebase/firestore'

let appPromise: Promise<FirebaseApp> | null = null
let dbPromise: Promise<Firestore> | null = null

function readConfig() {
  const env = import.meta.env
  return {
    apiKey:            env.VITE_FIREBASE_API_KEY as string,
    authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId:         env.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId:             env.VITE_FIREBASE_APP_ID as string
  }
}

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp } = await import('firebase/app')
      return initializeApp(readConfig())
    })()
  }
  return appPromise
}

export async function getDb(): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const app = await getFirebaseApp()
      const { getFirestore } = await import('firebase/firestore')
      return getFirestore(app)
    })()
  }
  return dbPromise
}
