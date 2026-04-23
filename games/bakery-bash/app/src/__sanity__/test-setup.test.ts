import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('runs in jsdom', () => {
    expect(typeof document).toBe('object')
    expect(document.body).toBeTruthy()
  })
})
