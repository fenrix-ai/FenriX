import { describe, it, expect } from 'vitest'
import { initialsOf, avatarPaletteFor } from '../GeometricAvatar'

describe('GeometricAvatar', () => {
  describe('initialsOf', () => {
    it('returns first letter of first and last word, uppercased', () => {
      expect(initialsOf('Tim Frenzel')).toBe('TF')
      expect(initialsOf('sofia morales vilchis')).toBe('SV')
    })
    it('returns single letter for single-word names', () => {
      expect(initialsOf('Cher')).toBe('C')
    })
    it('strips honorifics', () => {
      expect(initialsOf('Prof. Tim Frenzel')).toBe('TF')
      expect(initialsOf('Dr. Jane Doe')).toBe('JD')
    })
    it('handles empty input', () => {
      expect(initialsOf('')).toBe('?')
      expect(initialsOf('   ')).toBe('?')
    })
  })

  describe('avatarPaletteFor', () => {
    it('returns the same palette for the same name (deterministic)', () => {
      const a = avatarPaletteFor('Dylan Massaro')
      const b = avatarPaletteFor('Dylan Massaro')
      expect(a).toEqual(b)
    })
    it('returns different palettes for different names', () => {
      // Try several pairs — at least one pair must differ.
      const samples = ['Dylan Massaro', 'Sofia Morales', 'Kavin Ravi', 'Mia Truong']
      const palettes = new Set(samples.map(avatarPaletteFor))
      expect(palettes.size).toBeGreaterThan(1)
    })
    it('always returns one of the configured palettes', () => {
      const palette = avatarPaletteFor('Anyone')
      expect(['cyan', 'coral', 'mixed']).toContain(palette)
    })
  })
})
