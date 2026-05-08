import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitContact, type ContactPayload } from '../submit-contact'

const addDocMock = vi.fn()
const collectionMock = vi.fn(() => 'collectionRef')

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  collection: (...args: unknown[]) => collectionMock(...args),
  serverTimestamp: () => 'TS'
}))
vi.mock('../firebase', () => ({
  getDb: vi.fn().mockResolvedValue({})
}))

const valid: ContactPayload = {
  name: 'Sofia Morales',
  email: 'sofia@example.com',
  org: 'Chapman',
  topic: 'partnership',
  message: 'We would love to talk about partnering up.'
}

describe('submitContact', () => {
  beforeEach(() => {
    addDocMock.mockReset()
    collectionMock.mockClear()
  })

  it('writes to contact_submissions with a server timestamp', async () => {
    addDocMock.mockResolvedValue({ id: 'abc' })
    await submitContact(valid)
    expect(collectionMock).toHaveBeenCalledWith({}, 'contact_submissions')
    expect(addDocMock).toHaveBeenCalledWith('collectionRef', expect.objectContaining({
      name: 'Sofia Morales',
      email: 'sofia@example.com',
      createdAt: 'TS'
    }))
  })

  it('rejects when honeypot is filled', async () => {
    await expect(
      submitContact({ ...valid, _honeypot: 'spam' })
    ).rejects.toThrow(/honeypot/i)
    expect(addDocMock).not.toHaveBeenCalled()
  })

  it('trims whitespace before writing', async () => {
    addDocMock.mockResolvedValue({ id: 'abc' })
    await submitContact({ ...valid, name: '  Sofia  ', message: '  hello there  ' })
    expect(addDocMock).toHaveBeenCalledWith(
      'collectionRef',
      expect.objectContaining({ name: 'Sofia', message: 'hello there' })
    )
  })

  it('surfaces firestore errors', async () => {
    addDocMock.mockRejectedValue(new Error('permission-denied'))
    await expect(submitContact(valid)).rejects.toThrow(/permission-denied/)
  })
})
