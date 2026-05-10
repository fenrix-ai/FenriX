import { getDb } from './firebase'

export type ContactTopic = 'partnership' | 'sponsorship' | 'press' | 'joining' | 'other'

export type ContactPayload = {
  name: string
  email: string
  org?: string
  topic: ContactTopic
  message: string
  _honeypot?: string
}

export async function submitContact(payload: ContactPayload): Promise<void> {
  if (payload._honeypot) {
    throw new Error('honeypot triggered')
  }
  const db = await getDb()
  const { addDoc, collection, serverTimestamp } = await import('firebase/firestore')
  await addDoc(collection(db, 'contact_submissions'), {
    name: payload.name.trim(),
    email: payload.email.trim(),
    org: payload.org?.trim() ?? '',
    topic: payload.topic,
    message: payload.message.trim(),
    createdAt: serverTimestamp(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
  })
}
