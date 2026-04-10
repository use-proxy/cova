import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Design System Tokens', () => {
  // tokens.css is at the repo root styles/ directory
  const tokensPath = join(process.cwd(), '../../styles/tokens.css')
  let tokensContent: string

  try {
    tokensContent = readFileSync(tokensPath, 'utf-8')
  } catch {
    tokensContent = ''
  }

  const requiredTokens = [
    '--cova-bg',
    '--cova-surface',
    '--cova-gold',
    '--cova-ivory',
    '--cova-muted',
    '--cova-border',
    '--cova-success',
    '--cova-error',
  ]

  requiredTokens.forEach((token) => {
    it(`defines CSS variable ${token}`, () => {
      // tokens.css may not exist in all environments — skip with explicit warning
      if (!tokensContent) {
        expect.soft(tokensContent).toBeTruthy() // Mark as soft failure for visibility
        return
      }
      expect(tokensContent).toContain(token)
    })
  })

  it('cova-bg contains navy color value', () => {
    if (!tokensContent) return
    // Either #0A1628 or #091829 (slight variant seen in source)
    expect(tokensContent).toMatch(/#0[Aa]1628|#091829/)
  })

  it('cova-gold is #C9A84C', () => {
    if (!tokensContent) return
    expect(tokensContent).toContain('#C9A84C')
  })

  it('tokens file exists at ../../styles/tokens.css from apps/web', () => {
    expect(tokensContent.length).toBeGreaterThan(0)
  })

  it('contains font-related variables', () => {
    if (!tokensContent) return
    // Confirm at least one font definition exists
    const hasFontDefs =
      tokensContent.includes('EB Garamond') ||
      tokensContent.includes('Inter') ||
      tokensContent.includes('--font')
    expect(hasFontDefs).toBe(true)
  })

  it('contains transition/animation definitions', () => {
    if (!tokensContent) return
    const hasTransitions =
      tokensContent.includes('transition') || tokensContent.includes('animation')
    expect(hasTransitions).toBe(true)
  })
})
